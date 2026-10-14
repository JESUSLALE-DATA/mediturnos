import { getSql, type Sql } from "@/lib/db";
import { DEMO_PASSWORD } from "./demo";
import type {
  Contacto,
  Evolucion,
  Me,
  Obra,
  Patient,
  Permiso,
  Profesional,
  Receta,
  Snapshot,
  StaffUser,
  Turno,
} from "./types";
import {
  SLOT_HOURS,
  TURNOS_ESTADOS,
  cleanText,
  isIsoDate,
  isRole,
  isWeekday,
  loginKey,
  normalizeDni,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeUsername,
  todayAR,
  validatePassword,
  withinBookingWindow,
  type Role,
  type TurnoEstado,
} from "./validate";

type AuthCtx = {
  password: { hash: (password: string) => Promise<string> };
  internalAdapter: {
    findUserByEmail: (
      email: string,
    ) => Promise<{ user: { id: string; email: string; name: string } } | null>;
    createUser: (user: {
      email: string;
      name: string;
      emailVerified?: boolean;
    }) => Promise<{ id: string }>;
    linkAccount: (account: {
      accountId: string;
      providerId: string;
      password: string;
      userId: string;
    }) => Promise<unknown>;
  };
};

const PERMS: Array<[string, boolean]> = [
  ["pac_turnos_ver", true],
  ["pac_turnos_agregar", true],
  ["pac_turnos_editar", true],
  ["pac_datos_ver", true],
  ["pac_datos_editar", true],
  ["prof_agenda_ver", true],
  ["prof_agenda_agregar", true],
  ["prof_agenda_editar", true],
  ["prof_hc_ver", true],
  ["prof_hc_editar", true],
  ["sec_pacientes_ver", true],
  ["sec_pacientes_agregar", true],
  ["sec_pacientes_editar", true],
  ["sec_turnos_ver", true],
  ["sec_turnos_agregar", true],
  ["sec_turnos_editar", true],
  ["sec_obras_ver", true],
  ["sec_obras_editar", true],
];

let ready: Promise<void> | null = null;

export function ensureClinicReady(): Promise<void> {
  ready ??= seedClinic().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function pingDatabase(): Promise<boolean> {
  try {
    const sql = await getSql();
    await sql`select 1 as ok`;
    return true;
  } catch (error) {
    console.error("[mediturnos] database unreachable", error);
    return false;
  }
}

async function authCtx(): Promise<AuthCtx> {
  const { auth } = await import("@/lib/auth/server");
  return (await auth.$context) as AuthCtx;
}

async function createCredentialUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ ok: true; userId: string } | { ok: false; error: string; userId?: string }> {
  const ctx = await authCtx();
  const email = input.email.toLowerCase();
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing?.user?.id) {
    return { ok: false, error: "Ya existe una cuenta con ese correo.", userId: existing.user.id };
  }
  const passwordError = validatePassword(input.password);
  if (passwordError) return { ok: false, error: passwordError };
  const hash = await ctx.password.hash(input.password);
  const user = await ctx.internalAdapter.createUser({
    email,
    name: input.name,
    emailVerified: false,
  });
  if (!user?.id) return { ok: false, error: "No se pudo crear la cuenta." };
  try {
    await ctx.internalAdapter.linkAccount({
      accountId: user.id,
      providerId: "credential",
      password: hash,
      userId: user.id,
    });
  } catch (error) {
    const sql = await getSql();
    await sql`delete from "user" where id = ${user.id}`;
    console.error("[mediturnos] linkAccount failed", error);
    return { ok: false, error: "No se pudo proteger la contraseña de la cuenta." };
  }
  return { ok: true, userId: user.id };
}

async function deleteAuthUser(userId: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from patients where user_id = ${userId}`;
  await sql`delete from "user" where id = ${userId}`;
}

type DemoSpec = {
  email: string;
  username: string;
  name: string;
  role: Role;
  specialty?: string;
  license?: string;
  phone?: string;
  dni?: string;
  obra?: string;
};

const DEMO_USERS: DemoSpec[] = [
  {
    email: "admin@mediturnos.com",
    username: "admin",
    name: "Administrador Master",
    role: "admin",
  },
  {
    email: "secretaria@mediturnos.com",
    username: "secretaria",
    name: "Ana López",
    role: "secretaria",
    phone: "11 4000-1000",
  },
  {
    email: "maria.gonzalez@mediturnos.com",
    username: "doctora",
    name: "María González",
    role: "profesional",
    specialty: "Dermatología",
    license: "MP 12345",
    phone: "11 4000-2000",
  },
  {
    email: "juan.perez@mail.com",
    username: "paciente",
    name: "Juan Pérez",
    role: "paciente",
    dni: "32456789",
    obra: "OSDE",
    phone: "11 5555-1234",
  },
];

async function seedClinic(): Promise<void> {
  const sql = await getSql();
  for (const spec of DEMO_USERS) {
    await ensureDemoUser(sql, spec);
  }
  const obras = await sql<{ n: number }>`select count(*)::int as n from obras`;
  if ((obras[0]?.n ?? 0) === 0) {
    const rows: Array<[string, string, string, string, string]> = [
      ["OSDE", "$0", "$1.500", "$2.500", "$4.000"],
      ["Swiss Medical", "$0", "$1.800", "$3.000", "$4.500"],
      ["Galeno", "$500", "$2.000", "$3.200", "$5.000"],
      ["Medicus", "$0", "$1.600", "$2.800", "$4.200"],
      ["Particular", "—", "—", "—", "—"],
    ];
    for (const [nombre, gral, espec, practica, estudio] of rows) {
      await sql`
        insert into obras (nombre, estado, cos_gral, cos_espec, cos_practica, cos_estudio)
        values (${nombre}, 'Activa', ${gral}, ${espec}, ${practica}, ${estudio})
        on conflict (nombre) do nothing
      `;
    }
  }
  for (const [clave, enabled] of PERMS) {
    await sql`
      insert into permisos (clave, enabled) values (${clave}, ${enabled})
      on conflict (clave) do nothing
    `;
  }
  const contacts = await sql<{ n: number }>`select count(*)::int as n from contactos`;
  if ((contacts[0]?.n ?? 0) === 0) {
    await sql`
      insert into contactos (nombre, rol, telefono, email, notas)
      values (
        'Recepción',
        'Secretaría',
        '11 4000-1000',
        'secretaria@mediturnos.com',
        'Turnos de lunes a viernes, 8 a 18 h'
      )
    `;
  }
  const turnos = await sql<{ n: number }>`select count(*)::int as n from turnos`;
  if ((turnos[0]?.n ?? 0) === 0) {
    const juan = await sql<{ id: number }>`select id from patients where dni = '32456789'`;
    const dra = await sql<{ user_id: string }>`
      select user_id from profiles where username = 'doctora'
    `;
    if (juan[0] && dra[0]) {
      const today = todayAR();
      let past = today;
      for (let i = 1; i <= 7; i += 1) {
        const candidate = shiftBack(today, i);
        if (isWeekday(candidate)) {
          past = candidate;
          break;
        }
      }
      const slot = isWeekday(today) ? today : nextWeekday(today);
      await sql`
        insert into turnos (
          patient_id, professional_user_id, fecha, hora, motivo, observaciones, estado, created_by
        ) values (
          ${juan[0].id}, ${dra[0].user_id}, ${slot}, '11:00', 'Control',
          'Control dermatológico', 'Pendiente', ${dra[0].user_id}
        )
      `;
      await sql`
        insert into turnos (
          patient_id, professional_user_id, fecha, hora, motivo, observaciones, estado, created_by
        ) values (
          ${juan[0].id}, ${dra[0].user_id}, ${past}, '09:30', 'Consulta',
          'Primera consulta', 'Atendido', ${dra[0].user_id}
        )
      `;
      await sql`
        insert into evoluciones (patient_id, author_user_id, texto)
        values (
          ${juan[0].id},
          ${dra[0].user_id},
          'Control de nevo en dorso. Sin cambios de tamaño ni color. Se indica control en 6 meses.'
        )
      `;
    }
  }
}

function shiftBack(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function nextWeekday(iso: string): string {
  for (let i = 0; i <= 7; i += 1) {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const value = date.toISOString().slice(0, 10);
    if (isWeekday(value)) return value;
  }
  return iso;
}

async function ensureDemoUser(sql: Sql, spec: DemoSpec): Promise<void> {
  const found = await sql<{ id: string }>`
    select id from "user" where lower(email) = ${spec.email}
  `;
  let userId = found[0]?.id;
  if (!userId) {
    const created = await createCredentialUser({
      email: spec.email,
      password: DEMO_PASSWORD,
      name: spec.name,
    });
    userId = created.userId;
    if (!userId) throw new Error("No se pudo preparar la clínica de práctica.");
  }
  const profile = await sql<{ user_id: string }>`
    select user_id from profiles where user_id = ${userId}
  `;
  if (!profile[0]) {
    await sql`
      insert into profiles (user_id, role, username, status, specialty, license_no, phone)
      values (
        ${userId}, ${spec.role}, ${spec.username}, 'Habilitado',
        ${spec.specialty ?? ""}, ${spec.license ?? ""}, ${spec.phone ?? ""}
      )
    `;
  }
  if (spec.role === "paciente" && spec.dni) {
    const patient = await sql<{ id: number; user_id: string | null }>`
      select id, user_id from patients where dni = ${spec.dni} or user_id = ${userId} limit 1
    `;
    if (!patient[0]) {
      await sql`
        insert into patients (user_id, nombre, dni, phone, email, obra_social, status)
        values (${userId}, ${spec.name}, ${spec.dni}, ${spec.phone ?? ""}, ${spec.email}, ${spec.obra ?? "Particular"}, 'Habilitado')
      `;
    } else if (!patient[0].user_id) {
      await sql`update patients set user_id = ${userId} where id = ${patient[0].id}`;
    }
  }
}

function dbFailure(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/duplicate key|unique constraint|already exists/i.test(text)) {
    return "Ya existe un registro con esos datos.";
  }
  console.error("[mediturnos]", error);
  return "No se pudo completar la operación. La base de datos no confirmó el cambio.";
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

async function loadMe(sql: Sql, userId: string): Promise<Me | null> {
  const rows = await sql<{
    user_id: string;
    email: string;
    name: string;
    role: string;
    username: string | null;
    status: string;
    specialty: string;
    license_no: string;
    phone: string;
    patient_id: number | null;
  }>`
    select u.id as user_id, u.email, u.name, p.role, p.username, p.status,
           p.specialty, p.license_no, p.phone, pt.id as patient_id
    from "user" u
    join profiles p on p.user_id = u.id
    left join patients pt on pt.user_id = u.id
    where u.id = ${userId}
  `;
  const row = rows[0];
  if (!row || !isRole(row.role)) return null;
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    username: row.username,
    status: row.status,
    specialty: row.specialty,
    licenseNo: row.license_no,
    phone: row.phone,
    patientId: row.patient_id,
  };
}

async function allows(sql: Sql, role: Role, key: string): Promise<boolean> {
  if (role === "admin") return true;
  const rows = await sql<{ enabled: boolean }>`
    select enabled from permisos where clave = ${key}
  `;
  if (!rows[0]) return true;
  return asBool(rows[0].enabled);
}

function staff(role: Role): boolean {
  return role === "admin" || role === "secretaria" || role === "profesional";
}

export async function resolveLogin(
  identifier: string,
  ip: string,
): Promise<
  | { kind: "locked" }
  | { kind: "unknown" }
  | { kind: "ok"; email: string; userId: string; role: Role; status: string }
> {
  const sql = await getSql();
  const key = loginKey(ip, identifier);
  const locks = await sql<{ locked_until: string | null }>`
    select locked_until from login_attempts where identifier = ${key}
  `;
  if (locks[0]?.locked_until && new Date(locks[0].locked_until).getTime() > Date.now()) {
    return { kind: "locked" };
  }
  const id = identifier.trim().toLowerCase();
  const digits = normalizeDni(identifier) ?? "";
  const rows = await sql<{
    id: string;
    email: string;
    role: string;
    status: string;
  }>`
    select u.id, u.email, p.role, p.status
    from "user" u
    join profiles p on p.user_id = u.id
    left join patients pt on pt.user_id = u.id
    where lower(u.email) = ${id}
       or lower(coalesce(p.username, '')) = ${id}
       or (${id} = 'profesional' and p.username = 'doctora')
       or (${digits} <> '' and pt.dni = ${digits})
    limit 1
  `;
  const row = rows[0];
  if (!row || !isRole(row.role)) return { kind: "unknown" };
  return { kind: "ok", email: row.email, userId: row.id, role: row.role, status: row.status };
}

export async function recordLoginFailure(identifier: string, ip: string): Promise<"locked" | "retry"> {
  const sql = await getSql();
  const key = loginKey(ip, identifier);
  const rows = await sql<{ failures: number }>`
    insert into login_attempts (identifier, failures, locked_until)
    values (${key}, 1, null)
    on conflict (identifier) do update
      set failures = login_attempts.failures + 1,
          locked_until = case
            when login_attempts.failures + 1 >= 5 then now() + interval '15 minutes'
            else null
          end
    returning failures
  `;
  return (rows[0]?.failures ?? 1) >= 5 ? "locked" : "retry";
}

export async function clearLoginFailures(identifier: string, ip: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from login_attempts where identifier = ${loginKey(ip, identifier)}`;
}

export async function revokeSessions(userId: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from "session" where "userId" = ${userId}`;
}

export async function registerPatient(raw: unknown): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Datos incompletos." };
  const body = raw as Record<string, unknown>;
  const nombre = normalizeName(String(body.nombre ?? ""));
  const email = normalizeEmail(String(body.email ?? ""));
  const dni = normalizeDni(String(body.dni ?? ""));
  const phone = normalizePhone(String(body.phone ?? ""));
  const obra = cleanText(String(body.obra ?? "Particular"), 2, 60) ?? "Particular";
  const password = String(body.password ?? "");
  const confirm = String(body.confirm ?? "");
  if (!nombre) return { ok: false, error: "Ingrese el nombre completo." };
  if (!email) return { ok: false, error: "El correo no tiene un formato válido." };
  if (!dni) return { ok: false, error: "El DNI debe tener entre 7 y 10 dígitos." };
  if (!phone) return { ok: false, error: "Ingrese un teléfono de contacto válido." };
  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: passwordError };
  if (password !== confirm) return { ok: false, error: "Las contraseñas no coinciden." };

  try {
    await ensureClinicReady();
    const sql = await getSql();
    const dupDni = await sql<{ id: number }>`select id from patients where dni = ${dni}`;
    if (dupDni[0]) return { ok: false, error: "Ya existe un paciente con ese DNI." };
    const dupMail = await sql<{ id: string }>`select id from "user" where lower(email) = ${email}`;
    if (dupMail[0]) return { ok: false, error: "Ya existe una cuenta con ese correo." };

    const created = await createCredentialUser({ email, password, name: nombre });
    if (!created.ok || !created.userId) {
      return { ok: false, error: created.ok ? "No se pudo crear la cuenta." : created.error };
    }
    const userId = created.userId;
    try {
      await sql`
        insert into profiles (user_id, role, username, status, phone)
        values (${userId}, 'paciente', ${dni}, 'Habilitado', ${phone})
      `;
      await sql`
        insert into patients (user_id, nombre, dni, phone, email, obra_social, status)
        values (${userId}, ${nombre}, ${dni}, ${phone}, ${email}, ${obra}, 'Habilitado')
      `;
    } catch (error) {
      await deleteAuthUser(userId);
      return { ok: false, error: dbFailure(error) };
    }
    const saved = await sql<{ id: number }>`
      select id from patients where user_id = ${userId} and dni = ${dni}
    `;
    if (!saved[0]) {
      await deleteAuthUser(userId);
      return { ok: false, error: "La cuenta no quedó guardada. No se inició sesión." };
    }
    return { ok: true, email };
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

export async function loadSnapshot(
  userId: string,
): Promise<{ ok: true; data: Snapshot } | { ok: false; code: "needs_profile" } | { ok: false; error: string }> {
  try {
    await ensureClinicReady();
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me) return { ok: false, code: "needs_profile" };
    if (me.status !== "Habilitado") {
      return { ok: false, error: "La cuenta está suspendida. Consulte en recepción." };
    }
    const today = todayAR();
    const patientFilter =
      me.role === "paciente"
        ? me.patientId ?? -1
        : null;

    const patientRows = await sql<PatientRow>`
      select id, user_id, nombre, dni, phone, email, obra_social, plan_obra, afiliado,
             address, birth_date, gender, cuil, weight_kg, height_cm, status
      from patients
      where (${patientFilter}::int is null or id = ${patientFilter})
      order by nombre
    `;

    const turnoRows = await sql<TurnoRow>`
      select t.id, t.patient_id, pt.nombre as patient_name, t.professional_user_id,
             u.name as professional_name, t.fecha, t.hora, t.motivo, t.observaciones, t.estado
      from turnos t
      join patients pt on pt.id = t.patient_id
      join "user" u on u.id = t.professional_user_id
      where (${patientFilter}::int is null or t.patient_id = ${patientFilter})
      order by t.fecha desc, t.hora desc
    `;

    const profRows = await sql<{
      user_id: string;
      name: string;
      specialty: string;
      license_no: string;
      status: string;
    }>`
      select p.user_id, u.name, p.specialty, p.license_no, p.status
      from profiles p
      join "user" u on u.id = p.user_id
      where p.role = 'profesional' and p.status = 'Habilitado'
      order by u.name
    `;

    const obraRows =
      me.role === "paciente"
        ? await sql<ObraRow>`
            select id, nombre, estado, '' as cos_gral, '' as cos_espec, '' as cos_practica,
                   '' as cos_estudio, '' as contacto, '' as telefono, '' as email
            from obras where estado = 'Activa' order by nombre
          `
        : await sql<ObraRow>`
            select id, nombre, estado, cos_gral, cos_espec, cos_practica, cos_estudio,
                   contacto, telefono, email
            from obras order by nombre
          `;

    const evoRows = await sql<EvoRow>`
      select e.id, e.patient_id, pt.nombre as patient_name, u.name as author_name,
             e.turno_id, e.texto, e.created_at
      from evoluciones e
      join patients pt on pt.id = e.patient_id
      join "user" u on u.id = e.author_user_id
      where (${patientFilter}::int is null or e.patient_id = ${patientFilter})
      order by e.created_at desc
      limit 80
    `;

    const recetaRows = await sql<RecetaRow>`
      select r.id, r.patient_id, pt.nombre as patient_name, u.name as author_name,
             r.medicamento, r.indicaciones, r.created_at
      from recetas r
      join patients pt on pt.id = r.patient_id
      join "user" u on u.id = r.author_user_id
      where (${patientFilter}::int is null or r.patient_id = ${patientFilter})
      order by r.created_at desc
      limit 80
    `;

    const contactoRows = staff(me.role)
      ? await sql<Contacto>`
          select id, nombre, rol, telefono, email, notas from contactos order by nombre
        `
      : [];

    const permisoRows = await sql<{ clave: string; enabled: boolean }>`
      select clave, enabled from permisos order by clave
    `;

    const usuarios =
      me.role === "admin"
        ? await sql<{
            user_id: string;
            email: string;
            name: string;
            role: string;
            username: string | null;
            status: string;
            specialty: string;
          }>`
            select p.user_id, u.email, u.name, p.role, p.username, p.status, p.specialty
            from profiles p
            join "user" u on u.id = p.user_id
            order by p.role, u.name
          `
        : [];

    return {
      ok: true,
      data: {
        me,
        today,
        patients: patientRows.map(mapPatient),
        turnos: turnoRows.map(mapTurno),
        profesionales: profRows.map((row) => ({
          userId: row.user_id,
          nombre: row.name,
          specialty: row.specialty,
          licenseNo: row.license_no,
          status: row.status,
        })),
        obras: obraRows.map(mapObra),
        evoluciones: evoRows.map((row) => ({
          id: row.id,
          patientId: row.patient_id,
          patientName: row.patient_name,
          authorName: row.author_name,
          turnoId: row.turno_id,
          texto: row.texto,
          createdAt: String(row.created_at),
        })),
        recetas: recetaRows.map((row) => ({
          id: row.id,
          patientId: row.patient_id,
          patientName: row.patient_name,
          authorName: row.author_name,
          medicamento: row.medicamento,
          indicaciones: row.indicaciones,
          createdAt: String(row.created_at),
        })),
        contactos: contactoRows,
        permisos: permisoRows.map((row) => ({ clave: row.clave, enabled: asBool(row.enabled) })),
        usuarios: usuarios.flatMap((row) =>
          isRole(row.role)
            ? [
                {
                  userId: row.user_id,
                  email: row.email,
                  name: row.name,
                  role: row.role,
                  username: row.username,
                  status: row.status,
                  specialty: row.specialty,
                } satisfies StaffUser,
              ]
            : [],
        ),
      },
    };
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

type PatientRow = {
  id: number;
  user_id: string | null;
  nombre: string;
  dni: string;
  phone: string;
  email: string;
  obra_social: string;
  plan_obra: string;
  afiliado: string;
  address: string;
  birth_date: string | null;
  gender: string;
  cuil: string;
  weight_kg: string;
  height_cm: string;
  status: string;
};

function mapPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    userId: row.user_id,
    nombre: row.nombre,
    dni: row.dni,
    phone: row.phone,
    email: row.email,
    obraSocial: row.obra_social,
    planObra: row.plan_obra,
    afiliado: row.afiliado,
    address: row.address,
    birthDate: row.birth_date,
    gender: row.gender,
    cuil: row.cuil,
    weightKg: row.weight_kg,
    heightCm: row.height_cm,
    status: row.status,
  };
}

type TurnoRow = {
  id: number;
  patient_id: number;
  patient_name: string;
  professional_user_id: string;
  professional_name: string;
  fecha: string;
  hora: string;
  motivo: string;
  observaciones: string;
  estado: string;
};

function mapTurno(row: TurnoRow): Turno {
  const estado = TURNOS_ESTADOS.includes(row.estado as TurnoEstado)
    ? (row.estado as TurnoEstado)
    : "Pendiente";
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    professionalUserId: row.professional_user_id,
    professionalName: row.professional_name,
    fecha: String(row.fecha).slice(0, 10),
    hora: row.hora.slice(0, 5),
    motivo: row.motivo,
    observaciones: row.observaciones,
    estado,
  };
}

type ObraRow = {
  id: number;
  nombre: string;
  estado: string;
  cos_gral: string;
  cos_espec: string;
  cos_practica: string;
  cos_estudio: string;
  contacto: string;
  telefono: string;
  email: string;
};

function mapObra(row: ObraRow): Obra {
  return {
    id: row.id,
    nombre: row.nombre,
    estado: row.estado,
    cosGral: row.cos_gral,
    cosEspec: row.cos_espec,
    cosPractica: row.cos_practica,
    cosEstudio: row.cos_estudio,
    contacto: row.contacto,
    telefono: row.telefono,
    email: row.email,
  };
}

type EvoRow = {
  id: number;
  patient_id: number;
  patient_name: string;
  author_name: string;
  turno_id: number | null;
  texto: string;
  created_at: string;
};

type RecetaRow = {
  id: number;
  patient_id: number;
  patient_name: string;
  author_name: string;
  medicamento: string;
  indicaciones: string;
  created_at: string;
};

function readPatientInput(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

export async function savePatient(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  try {
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me) return { ok: false, error: "Su perfil no está completo." };
    const id = body.id == null || body.id === "" ? null : Number(body.id);
    const creating = id == null || Number.isNaN(id);

    if (me.role === "paciente") {
      if (creating || id !== me.patientId) {
        return { ok: false, error: "No puede modificar los datos de otro paciente." };
      }
      if (!(await allows(sql, me.role, "pac_datos_editar"))) {
        return { ok: false, error: "La edición de datos está deshabilitada." };
      }
      const phone = normalizePhone(String(body.phone ?? ""));
      const email = normalizeEmail(String(body.email ?? me.email));
      const obra = cleanText(String(body.obraSocial ?? ""), 2, 60);
      if (!phone || !email || !obra) return { ok: false, error: "Revise teléfono, correo y cobertura." };
      const taken = await sql<{ id: string }>`
        select id from "user" where lower(email) = ${email} and id <> ${userId}
      `;
      if (taken[0]) return { ok: false, error: "Ese correo ya pertenece a otra cuenta." };
      await sql`
        update patients set
          phone = ${phone},
          email = ${email},
          obra_social = ${obra},
          plan_obra = ${cleanText(String(body.planObra ?? ""), 0, 40) ?? ""},
          afiliado = ${cleanText(String(body.afiliado ?? ""), 0, 40) ?? ""},
          address = ${cleanText(String(body.address ?? ""), 0, 120) ?? ""},
          birth_date = ${optionalDate(body.birthDate)},
          gender = ${cleanText(String(body.gender ?? ""), 0, 30) ?? ""},
          cuil = ${cleanText(String(body.cuil ?? ""), 0, 20) ?? ""},
          weight_kg = ${cleanText(String(body.weightKg ?? ""), 0, 10) ?? ""},
          height_cm = ${cleanText(String(body.heightCm ?? ""), 0, 10) ?? ""}
        where id = ${me.patientId} and user_id = ${userId}
      `;
      await sql`
        update "user" set email = ${email}, "updatedAt" = now() where id = ${userId}
      `;
      return snapshotOf(userId);
    }

    if (!staff(me.role)) return { ok: false, error: "No tiene permiso para esta acción." };
    const editKey = creating ? "sec_pacientes_agregar" : "sec_pacientes_editar";
    const profOk = me.role === "profesional" && (await allows(sql, me.role, "prof_agenda_ver"));
    if (me.role === "secretaria" && !(await allows(sql, me.role, editKey))) {
      return { ok: false, error: "Esa acción está deshabilitada por administración." };
    }
    if (me.role === "profesional" && !profOk) {
      return { ok: false, error: "No tiene permiso para gestionar pacientes." };
    }

    const nombre = normalizeName(String(body.nombre ?? ""));
    const dni = normalizeDni(String(body.dni ?? ""));
    const phone = String(body.phone ?? "").trim() ? normalizePhone(String(body.phone ?? "")) : "";
    const emailRaw = String(body.email ?? "").trim();
    const email = emailRaw ? normalizeEmail(emailRaw) : "";
    const obra = cleanText(String(body.obraSocial ?? "Particular"), 2, 60);
    const status = body.status === "Suspendido" ? "Suspendido" : "Habilitado";
    if (!nombre || !dni || !obra) return { ok: false, error: "Nombre, DNI y cobertura son obligatorios." };
    if (String(body.phone ?? "").trim() && phone === null) {
      return { ok: false, error: "El teléfono no es válido." };
    }
    if (emailRaw && !email) return { ok: false, error: "El correo no tiene un formato válido." };

    const dup = await sql<{ id: number }>`
      select id from patients where dni = ${dni} and id <> ${creating ? -1 : id}
    `;
    if (dup[0]) return { ok: false, error: "Ya existe un paciente con ese DNI." };

    let patientId = id;
    if (creating) {
      const inserted = await sql<{ id: number }>`
        insert into patients (
          nombre, dni, phone, email, obra_social, plan_obra, afiliado, address,
          birth_date, gender, cuil, weight_kg, height_cm, status
        ) values (
          ${nombre}, ${dni}, ${phone ?? ""}, ${email ?? ""}, ${obra},
          ${cleanText(String(body.planObra ?? ""), 0, 40) ?? ""},
          ${cleanText(String(body.afiliado ?? ""), 0, 40) ?? ""},
          ${cleanText(String(body.address ?? ""), 0, 120) ?? ""},
          ${optionalDate(body.birthDate)},
          ${cleanText(String(body.gender ?? ""), 0, 30) ?? ""},
          ${cleanText(String(body.cuil ?? ""), 0, 20) ?? ""},
          ${cleanText(String(body.weightKg ?? ""), 0, 10) ?? ""},
          ${cleanText(String(body.heightCm ?? ""), 0, 10) ?? ""},
          ${status}
        )
        returning id
      `;
      patientId = inserted[0]?.id ?? null;
      if (!patientId) return { ok: false, error: "El paciente no quedó guardado." };
    } else {
      const owned = await sql<{ user_id: string | null }>`select user_id from patients where id = ${id}`;
      if (!owned[0]) return { ok: false, error: "Paciente no encontrado." };
      await sql`
        update patients set
          nombre = ${nombre}, dni = ${dni}, phone = ${phone ?? ""}, email = ${email ?? ""},
          obra_social = ${obra},
          plan_obra = ${cleanText(String(body.planObra ?? ""), 0, 40) ?? ""},
          afiliado = ${cleanText(String(body.afiliado ?? ""), 0, 40) ?? ""},
          address = ${cleanText(String(body.address ?? ""), 0, 120) ?? ""},
          birth_date = ${optionalDate(body.birthDate)},
          gender = ${cleanText(String(body.gender ?? ""), 0, 30) ?? ""},
          cuil = ${cleanText(String(body.cuil ?? ""), 0, 20) ?? ""},
          weight_kg = ${cleanText(String(body.weightKg ?? ""), 0, 10) ?? ""},
          height_cm = ${cleanText(String(body.heightCm ?? ""), 0, 10) ?? ""},
          status = ${status}
        where id = ${id}
      `;
      if (owned[0].user_id) {
        await sql`
          update profiles set status = ${status}, phone = ${phone ?? ""} where user_id = ${owned[0].user_id}
        `;
        await sql`update "user" set name = ${nombre}, "updatedAt" = now() where id = ${owned[0].user_id}`;
        if (email) {
          const taken = await sql<{ id: string }>`
            select id from "user" where lower(email) = ${email} and id <> ${owned[0].user_id}
          `;
          if (taken[0]) return { ok: false, error: "Ese correo ya pertenece a otra cuenta." };
          await sql`
            update "user" set email = ${email}, "updatedAt" = now() where id = ${owned[0].user_id}
          `;
        }
      }
    }

    const portal = body.portal;
    if (portal && typeof portal === "object" && patientId) {
      const portalBody = portal as Record<string, unknown>;
      const portalEmail = normalizeEmail(String(portalBody.email ?? email ?? ""));
      const portalPassword = String(portalBody.password ?? "");
      if (!portalEmail) return { ok: false, error: "Para dar acceso al portal hace falta un correo válido." };
      const passwordError = validatePassword(portalPassword);
      if (passwordError) return { ok: false, error: passwordError };
      const linked = await sql<{ user_id: string | null }>`select user_id from patients where id = ${patientId}`;
      if (linked[0]?.user_id) {
        return { ok: false, error: "Este paciente ya tiene una cuenta. No se creó otra." };
      }
      const created = await createCredentialUser({
        email: portalEmail,
        password: portalPassword,
        name: nombre,
      });
      if (!created.ok || !created.userId) return { ok: false, error: created.error };
      try {
        await sql`
          insert into profiles (user_id, role, username, status, phone)
          values (${created.userId}, 'paciente', ${dni}, ${status}, ${phone ?? ""})
        `;
        await sql`
          update patients set user_id = ${created.userId}, email = ${portalEmail} where id = ${patientId}
        `;
      } catch (error) {
        await deleteAuthUser(created.userId);
        return { ok: false, error: dbFailure(error) };
      }
    }

    return snapshotOf(userId);
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

function optionalDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const iso = String(value);
  return isIsoDate(iso) ? iso : null;
}

async function snapshotOf(
  userId: string,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const loaded = await loadSnapshot(userId);
  if (!loaded.ok) {
    return {
      ok: false,
      error: "error" in loaded ? loaded.error : "No se pudo leer la información guardada.",
    };
  }
  return loaded;
}

export async function saveAppointment(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  try {
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me) return { ok: false, error: "Su perfil no está completo." };
    const fecha = String(body.fecha ?? "");
    const hora = String(body.hora ?? "");
    const motivo = cleanText(String(body.motivo ?? "Consulta"), 3, 80);
    const observaciones = cleanText(String(body.observaciones ?? ""), 0, 500) ?? "";
    const professionalUserId = String(body.professionalUserId ?? "");
    const id = body.id == null || body.id === "" ? null : Number(body.id);
    if (!isIsoDate(fecha) || !isWeekday(fecha)) {
      return { ok: false, error: "Elija un día hábil válido." };
    }
    if (!SLOT_HOURS.includes(hora as (typeof SLOT_HOURS)[number])) {
      return { ok: false, error: "El horario no está dentro de la agenda." };
    }
    if (!motivo) return { ok: false, error: "Indique el motivo de la consulta." };
    if (!withinBookingWindow(fecha, todayAR())) {
      return { ok: false, error: "La fecha está fuera del período de reserva." };
    }
    const prof = await sql<{ role: string; status: string }>`
      select role, status from profiles where user_id = ${professionalUserId}
    `;
    if (!prof[0] || prof[0].role !== "profesional" || prof[0].status !== "Habilitado") {
      return { ok: false, error: "El profesional no está disponible." };
    }

    let patientId: number;
    if (me.role === "paciente") {
      if (!(await allows(sql, me.role, id ? "pac_turnos_editar" : "pac_turnos_agregar"))) {
        return { ok: false, error: "La reserva de turnos está deshabilitada." };
      }
      if (!me.patientId) return { ok: false, error: "No hay una ficha de paciente vinculada a su cuenta." };
      if (id) return { ok: false, error: "Para cambiar el horario cancele el turno y reserve otro." };
      patientId = me.patientId;
    } else if (staff(me.role)) {
      const key = me.role === "profesional" ? "prof_agenda_agregar" : "sec_turnos_agregar";
      if (me.role !== "admin" && !(await allows(sql, me.role, id ? (me.role === "profesional" ? "prof_agenda_editar" : "sec_turnos_editar") : key))) {
        return { ok: false, error: "No tiene permiso para modificar la agenda." };
      }
      patientId = Number(body.patientId);
      const exists = await sql<{ id: number; status: string }>`
        select id, status from patients where id = ${patientId}
      `;
      if (!exists[0]) return { ok: false, error: "El paciente no existe." };
      if (exists[0].status !== "Habilitado") {
        return { ok: false, error: "El paciente está suspendido." };
      }
    } else {
      return { ok: false, error: "No tiene permiso para esta acción." };
    }

    if (id) {
      const current = await sql<{ estado: string }>`select estado from turnos where id = ${id}`;
      if (!current[0]) return { ok: false, error: "Turno no encontrado." };
      if (current[0].estado === "Cancelado" || current[0].estado === "Atendido") {
        return { ok: false, error: "Ese turno ya no se puede modificar." };
      }
      const updated = await sql<{ id: number }>`
        update turnos set
          patient_id = ${patientId},
          professional_user_id = ${professionalUserId},
          fecha = ${fecha},
          hora = ${hora},
          motivo = ${motivo},
          observaciones = ${observaciones}
        where id = ${id}
          and estado in ('Pendiente', 'Confirmado')
          and not exists (
            select 1 from turnos other
            where other.professional_user_id = ${professionalUserId}
              and other.fecha = ${fecha}
              and other.hora = ${hora}
              and other.estado <> 'Cancelado'
              and other.id <> ${id}
          )
        returning id
      `;
      if (!updated[0]) return { ok: false, error: "Ese horario ya está ocupado." };
      return snapshotOf(userId);
    }

    const inserted = await sql<{ id: number }>`
      insert into turnos (
        patient_id, professional_user_id, fecha, hora, motivo, observaciones, estado, created_by
      )
      select ${patientId}, ${professionalUserId}, ${fecha}, ${hora}, ${motivo}, ${observaciones},
             'Pendiente', ${userId}
      where not exists (
        select 1 from turnos
        where professional_user_id = ${professionalUserId}
          and fecha = ${fecha}
          and hora = ${hora}
          and estado <> 'Cancelado'
      )
      returning id
    `;
    if (!inserted[0]) return { ok: false, error: "Ese horario acaba de ser reservado. Elija otro." };
    const check = await sql<{ id: number }>`select id from turnos where id = ${inserted[0].id}`;
    if (!check[0]) return { ok: false, error: "El turno no quedó guardado." };
    return snapshotOf(userId);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/duplicate key|unique/i.test(text)) {
      return { ok: false, error: "Ese horario acaba de ser reservado. Elija otro." };
    }
    return { ok: false, error: dbFailure(error) };
  }
}

export async function setAppointmentEstado(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  const id = Number(body.id);
  const estado = String(body.estado ?? "");
  if (!TURNOS_ESTADOS.includes(estado as TurnoEstado)) {
    return { ok: false, error: "Estado de turno no válido." };
  }
  try {
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me) return { ok: false, error: "Su perfil no está completo." };
    const rows = await sql<{
      id: number;
      patient_id: number;
      estado: string;
      fecha: string;
      patient_user: string | null;
    }>`
      select t.id, t.patient_id, t.estado, t.fecha, pt.user_id as patient_user
      from turnos t
      join patients pt on pt.id = t.patient_id
      where t.id = ${id}
    `;
    const turno = rows[0];
    if (!turno) return { ok: false, error: "Turno no encontrado." };
    if (me.role === "paciente") {
      if (turno.patient_user !== userId) {
        return { ok: false, error: "No puede modificar el turno de otro paciente." };
      }
      if (!(await allows(sql, me.role, "pac_turnos_editar"))) {
        return { ok: false, error: "No puede cambiar el estado de sus turnos." };
      }
      const fecha = String(turno.fecha).slice(0, 10);
      if (estado === "Confirmado" && turno.estado === "Pendiente") {
        /* ok */
      } else if (
        estado === "Cancelado" &&
        (turno.estado === "Pendiente" || turno.estado === "Confirmado") &&
        fecha >= todayAR()
      ) {
        /* ok */
      } else {
        return { ok: false, error: "Esa acción no está permitida sobre este turno." };
      }
    } else if (staff(me.role)) {
      const key = me.role === "profesional" ? "prof_agenda_editar" : "sec_turnos_editar";
      if (me.role !== "admin" && !(await allows(sql, me.role, key))) {
        return { ok: false, error: "No tiene permiso para cambiar turnos." };
      }
      if (turno.estado === "Cancelado") return { ok: false, error: "El turno ya fue cancelado." };
      if (estado === "Atendido" && turno.estado !== "Pendiente" && turno.estado !== "Confirmado") {
        return { ok: false, error: "Solo un turno pendiente o confirmado puede marcarse atendido." };
      }
    } else {
      return { ok: false, error: "No tiene permiso para esta acción." };
    }
    const updated = await sql<{ id: number }>`
      update turnos set estado = ${estado} where id = ${id} and estado <> 'Cancelado' returning id
    `;
    if (!updated[0]) return { ok: false, error: "No se pudo actualizar el turno." };
    return snapshotOf(userId);
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

export async function saveObra(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  try {
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me || (me.role !== "admin" && me.role !== "secretaria")) {
      return { ok: false, error: "No tiene permiso para obras sociales." };
    }
    if (!(await allows(sql, me.role, "sec_obras_editar"))) {
      return { ok: false, error: "La edición de obras sociales está deshabilitada." };
    }
    const nombre = cleanText(String(body.nombre ?? ""), 2, 60);
    if (!nombre) return { ok: false, error: "Indique el nombre de la cobertura." };
    const estado = body.estado === "Inactiva" ? "Inactiva" : "Activa";
    const id = body.id == null || body.id === "" ? null : Number(body.id);
    if (id) {
      await sql`
        update obras set
          nombre = ${nombre}, estado = ${estado},
          cos_gral = ${cleanText(String(body.cosGral ?? ""), 0, 20) ?? ""},
          cos_espec = ${cleanText(String(body.cosEspec ?? ""), 0, 20) ?? ""},
          cos_practica = ${cleanText(String(body.cosPractica ?? ""), 0, 20) ?? ""},
          cos_estudio = ${cleanText(String(body.cosEstudio ?? ""), 0, 20) ?? ""},
          contacto = ${cleanText(String(body.contacto ?? ""), 0, 80) ?? ""},
          telefono = ${cleanText(String(body.telefono ?? ""), 0, 30) ?? ""},
          email = ${String(body.email ?? "").trim() ? (normalizeEmail(String(body.email)) ?? "") : ""}
        where id = ${id}
      `;
    } else {
      await sql`
        insert into obras (nombre, estado, cos_gral, cos_espec, cos_practica, cos_estudio, contacto, telefono, email)
        values (
          ${nombre}, ${estado},
          ${cleanText(String(body.cosGral ?? ""), 0, 20) ?? ""},
          ${cleanText(String(body.cosEspec ?? ""), 0, 20) ?? ""},
          ${cleanText(String(body.cosPractica ?? ""), 0, 20) ?? ""},
          ${cleanText(String(body.cosEstudio ?? ""), 0, 20) ?? ""},
          ${cleanText(String(body.contacto ?? ""), 0, 80) ?? ""},
          ${cleanText(String(body.telefono ?? ""), 0, 30) ?? ""},
          ${String(body.email ?? "").trim() ? (normalizeEmail(String(body.email)) ?? "") : ""}
        )
      `;
    }
    return snapshotOf(userId);
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

export async function saveEvolucion(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  try {
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me || !staff(me.role)) return { ok: false, error: "No puede escribir en la historia clínica." };
    if (!(await allows(sql, me.role, "prof_hc_editar"))) {
      return { ok: false, error: "La historia clínica está en solo lectura." };
    }
    const patientId = Number(body.patientId);
    const texto = cleanText(String(body.texto ?? ""), 5, 4000);
    if (!texto) return { ok: false, error: "Escriba la evolución (mínimo 5 caracteres)." };
    const patient = await sql<{ id: number }>`select id from patients where id = ${patientId}`;
    if (!patient[0]) return { ok: false, error: "Paciente no encontrado." };
    const inserted = await sql<{ id: number }>`
      insert into evoluciones (patient_id, author_user_id, texto)
      values (${patientId}, ${userId}, ${texto})
      returning id
    `;
    if (!inserted[0]) return { ok: false, error: "La evolución no quedó guardada." };
    return snapshotOf(userId);
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

export async function saveReceta(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  try {
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me || (me.role !== "profesional" && me.role !== "admin")) {
      return { ok: false, error: "Solo un profesional puede registrar una receta." };
    }
    const patientId = Number(body.patientId);
    const medicamento = cleanText(String(body.medicamento ?? ""), 3, 160);
    const indicaciones = cleanText(String(body.indicaciones ?? ""), 0, 500) ?? "";
    if (!medicamento) return { ok: false, error: "Indique el medicamento." };
    const patient = await sql<{ id: number }>`select id from patients where id = ${patientId}`;
    if (!patient[0]) return { ok: false, error: "Paciente no encontrado." };
    const inserted = await sql<{ id: number }>`
      insert into recetas (patient_id, author_user_id, medicamento, indicaciones)
      values (${patientId}, ${userId}, ${medicamento}, ${indicaciones})
      returning id
    `;
    if (!inserted[0]) return { ok: false, error: "La receta no quedó guardada." };
    return snapshotOf(userId);
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

export async function saveContacto(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  try {
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me || (me.role !== "admin" && me.role !== "secretaria")) {
      return { ok: false, error: "No tiene permiso para contactos." };
    }
    const nombre = normalizeName(String(body.nombre ?? ""));
    if (!nombre) return { ok: false, error: "Indique el nombre del contacto." };
    const id = body.id == null || body.id === "" ? null : Number(body.id);
    const rol = cleanText(String(body.rol ?? ""), 0, 40) ?? "";
    const telefono = cleanText(String(body.telefono ?? ""), 0, 30) ?? "";
    const email = String(body.email ?? "").trim() ? (normalizeEmail(String(body.email)) ?? "") : "";
    const notas = cleanText(String(body.notas ?? ""), 0, 200) ?? "";
    if (id) {
      await sql`
        update contactos set nombre = ${nombre}, rol = ${rol}, telefono = ${telefono}, email = ${email}, notas = ${notas}
        where id = ${id}
      `;
    } else {
      await sql`
        insert into contactos (nombre, rol, telefono, email, notas)
        values (${nombre}, ${rol}, ${telefono}, ${email}, ${notas})
      `;
    }
    return snapshotOf(userId);
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

export async function setPermiso(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  try {
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me || me.role !== "admin") return { ok: false, error: "Solo administración puede cambiar permisos." };
    const clave = String(body.clave ?? "");
    if (!PERMS.some(([key]) => key === clave)) return { ok: false, error: "Permiso desconocido." };
    const enabled = body.enabled === true;
    const updated = await sql<{ clave: string }>`
      update permisos set enabled = ${enabled} where clave = ${clave} returning clave
    `;
    if (!updated[0]) return { ok: false, error: "No se pudo guardar el permiso." };
    return snapshotOf(userId);
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

export async function createStaff(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  try {
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me || me.role !== "admin") return { ok: false, error: "Solo administración puede crear cuentas de equipo." };
    const nombre = normalizeName(String(body.nombre ?? ""));
    const email = normalizeEmail(String(body.email ?? ""));
    const username = normalizeUsername(String(body.username ?? ""));
    const password = String(body.password ?? "");
    const role = body.role;
    if (!nombre || !email || !username) {
      return { ok: false, error: "Complete nombre, correo y usuario." };
    }
    if (role !== "admin" && role !== "secretaria" && role !== "profesional") {
      return { ok: false, error: "El rol no es válido." };
    }
    const passwordError = validatePassword(password);
    if (passwordError) return { ok: false, error: passwordError };
    const takenUser = await sql<{ user_id: string }>`
      select user_id from profiles where lower(username) = ${username}
    `;
    if (takenUser[0]) return { ok: false, error: "Ese usuario ya existe." };
    const created = await createCredentialUser({ email, password, name: nombre });
    if (!created.ok || !created.userId) return { ok: false, error: created.error };
    try {
      await sql`
        insert into profiles (user_id, role, username, status, specialty, license_no, phone)
        values (
          ${created.userId}, ${role}, ${username}, 'Habilitado',
          ${cleanText(String(body.specialty ?? ""), 0, 60) ?? ""},
          ${cleanText(String(body.licenseNo ?? ""), 0, 30) ?? ""},
          ${String(body.phone ?? "").trim() ? (normalizePhone(String(body.phone)) ?? "") : ""}
        )
      `;
    } catch (error) {
      await deleteAuthUser(created.userId);
      return { ok: false, error: dbFailure(error) };
    }
    const saved = await sql<{ user_id: string }>`select user_id from profiles where user_id = ${created.userId}`;
    if (!saved[0]) {
      await deleteAuthUser(created.userId);
      return { ok: false, error: "La cuenta de equipo no quedó guardada." };
    }
    return snapshotOf(userId);
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

export async function setUserStatus(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  try {
    const sql = await getSql();
    const me = await loadMe(sql, userId);
    if (!me || me.role !== "admin") return { ok: false, error: "Solo administración puede suspender cuentas." };
    const target = String(body.userId ?? "");
    const status = body.status === "Suspendido" ? "Suspendido" : "Habilitado";
    if (target === userId && status !== "Habilitado") {
      return { ok: false, error: "No puede suspender su propia cuenta." };
    }
    const updated = await sql<{ user_id: string }>`
      update profiles set status = ${status} where user_id = ${target} returning user_id
    `;
    if (!updated[0]) return { ok: false, error: "Cuenta no encontrada." };
    await sql`update patients set status = ${status} where user_id = ${target}`;
    if (status === "Suspendido") await revokeSessions(target);
    return snapshotOf(userId);
  } catch (error) {
    return { ok: false, error: dbFailure(error) };
  }
}

export async function attachOwnPatient(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }> {
  const body = readPatientInput(raw);
  if (!body) return { ok: false, error: "Datos incompletos." };
  const nombre = normalizeName(String(body.nombre ?? ""));
  const dni = normalizeDni(String(body.dni ?? ""));
  const phone = normalizePhone(String(body.phone ?? ""));
  const obra = cleanText(String(body.obra ?? "Particular"), 2, 60);
  if (!nombre || !dni || !phone || !obra) {
    return { ok: false, error: "Complete nombre, DNI, teléfono y cobertura." };
  }
  try {
    const sql = await getSql();
    const existing = await loadMe(sql, userId);
    if (existing) return { ok: false, error: "Su ficha ya existe. No se creó otra cuenta." };
    const user = await sql<{ email: string; name: string }>`
      select email, name from "user" where id = ${userId}
    `;
    if (!user[0]) return { ok: false, error: "No hay una sesión válida." };
    const dup = await sql<{ id: number; user_id: string | null }>`
      select id, user_id from patients where dni = ${dni}
    `;
    if (dup[0]?.user_id && dup[0].user_id !== userId) {
      return { ok: false, error: "Ese DNI ya está vinculado a otra cuenta." };
    }
    await sql`
      insert into profiles (user_id, role, username, status, phone)
      values (${userId}, 'paciente', ${dni}, 'Habilitado', ${phone})
    `;
    if (dup[0] && !dup[0].user_id) {
      await sql`
        update patients set user_id = ${userId}, nombre = ${nombre}, phone = ${phone},
          email = ${user[0].email}, obra_social = ${obra}
        where id = ${dup[0].id} and user_id is null
      `;
    } else if (!dup[0]) {
      await sql`
        insert into patients (user_id, nombre, dni, phone, email, obra_social, status)
        values (${userId}, ${nombre}, ${dni}, ${phone}, ${user[0].email}, ${obra}, 'Habilitado')
      `;
    }
    await sql`update "user" set name = ${nombre}, "updatedAt" = now() where id = ${userId}`;
    return snapshotOf(userId);
  } catch (error) {
    const sql = await getSql();
    await sql`delete from profiles where user_id = ${userId}`;
    return { ok: false, error: dbFailure(error) };
  }
}

export async function readPatientGuard(
  userId: string,
  patientId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sql = await getSql();
  const me = await loadMe(sql, userId);
  if (!me) return { ok: false, error: "Su perfil no está completo." };
  if (me.role === "paciente") {
    if (me.patientId !== patientId) {
      return { ok: false, error: "No puede consultar los datos de otro paciente." };
    }
    return { ok: true };
  }
  if (!staff(me.role)) return { ok: false, error: "No tiene permiso." };
  const rows = await sql<{ id: number }>`select id from patients where id = ${patientId}`;
  if (!rows[0]) return { ok: false, error: "Paciente no encontrado." };
  return { ok: true };
}
