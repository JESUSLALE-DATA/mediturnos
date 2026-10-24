import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  ClipboardPlus,
  Contact,
  LayoutDashboard,
  Menu,
  Shield,
  Stethoscope,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { authClient } from "@/lib/auth/client";
import { UserButton } from "@/lib/auth/gates";
import { Mark } from "@/components/mark";
import {
  attachOwnPatientFn,
  createStaffFn,
  getSnapshot,
  saveAppointmentFn,
  saveContactoFn,
  saveEvolucionFn,
  saveObraFn,
  savePatientFn,
  saveRecetaFn,
  setAppointmentEstadoFn,
  setPermisoFn,
  setUserStatusFn,
} from "@/lib/mediturnos/fns";
import type { Obra, Patient, Snapshot, Turno } from "@/lib/mediturnos/types";
import { ROLE_LABEL, SLOT_HOURS, isWeekday, type Role } from "@/lib/mediturnos/validate";

type Run = (
  action: () => Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }>,
  success: string,
) => Promise<void>;

type Section =
  | "inicio"
  | "turnos"
  | "pedir"
  | "datos"
  | "pacientes"
  | "obras"
  | "historial"
  | "agenda"
  | "estadisticas"
  | "profesionales"
  | "recetas"
  | "contactos"
  | "permisos"
  | "equipo";

const NAV: Record<Role, Array<{ id: Section; label: string; icon: typeof LayoutDashboard }>> = {
  paciente: [
    { id: "inicio", label: "Inicio", icon: LayoutDashboard },
    { id: "turnos", label: "Mis turnos", icon: CalendarDays },
    { id: "pedir", label: "Pedir turno", icon: ClipboardPlus },
    { id: "datos", label: "Mis datos", icon: UserRound },
  ],
  secretaria: [
    { id: "inicio", label: "Inicio", icon: LayoutDashboard },
    { id: "pacientes", label: "Pacientes", icon: Users },
    { id: "turnos", label: "Turnos", icon: CalendarDays },
    { id: "agenda", label: "Agenda", icon: CalendarDays },
    { id: "estadisticas", label: "Estadísticas", icon: BarChart3 },
    { id: "historial", label: "Historial clínico", icon: Stethoscope },
    { id: "obras", label: "Obras sociales", icon: ClipboardPlus },
    { id: "contactos", label: "Contactos", icon: Contact },
    { id: "profesionales", label: "Profesionales", icon: Stethoscope },
  ],
  profesional: [
    { id: "inicio", label: "Inicio", icon: LayoutDashboard },
    { id: "agenda", label: "Agenda", icon: CalendarDays },
    { id: "turnos", label: "Turnos", icon: CalendarDays },
    { id: "estadisticas", label: "Estadísticas", icon: BarChart3 },
    { id: "pacientes", label: "Pacientes", icon: Users },
    { id: "historial", label: "Historial clínico", icon: Stethoscope },
    { id: "recetas", label: "Recetas", icon: ClipboardPlus },
    { id: "contactos", label: "Contactos", icon: Contact },
  ],
  admin: [
    { id: "inicio", label: "Inicio", icon: LayoutDashboard },
    { id: "pacientes", label: "Pacientes", icon: Users },
    { id: "turnos", label: "Turnos", icon: CalendarDays },
    { id: "agenda", label: "Agenda", icon: CalendarDays },
    { id: "estadisticas", label: "Estadísticas", icon: BarChart3 },
    { id: "obras", label: "Obras sociales", icon: ClipboardPlus },
    { id: "profesionales", label: "Profesionales", icon: Stethoscope },
    { id: "permisos", label: "Permisos", icon: Shield },
    { id: "equipo", label: "Equipo", icon: Users },
    { id: "contactos", label: "Contactos", icon: Contact },
  ],
};

function allowed(data: Snapshot, key: string): boolean {
  if (data.me.role === "admin") return true;
  const row = data.permisos.find((item) => item.clave === key);
  return row ? row.enabled : true;
}

function Notice({ text, tone }: { text: string; tone: "error" | "ok" }) {
  return (
    <p
      role="alert"
      className={`rounded-xl px-3 py-2 text-sm ${tone === "error" ? "bg-danger-bg text-danger" : "bg-mint text-pine"}`}
    >
      {text}
    </p>
  );
}

export function PanelApp() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("inicio");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const result = await getSnapshot();
    if (result.ok) {
      setData(result.data);
      setNeedsProfile(false);
      setError(null);
      return result.data;
    }
    if ("code" in result && result.code === "needs_profile") {
      setNeedsProfile(true);
      setData(null);
      return null;
    }
    setError("error" in result ? result.error : "No se pudo cargar el consultorio.");
    return null;
  }

  useEffect(() => {
    let alive = true;
    refresh()
      .catch(() => {
        if (alive) setError("Debe iniciar sesión para ver esta sección.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Polling: cuando un paciente pide turno, le "salta" a la doctora y a la secretaría
  useEffect(() => {
    if (!data) return;
    if (data.me.role === "paciente") return;
    const id = window.setInterval(() => {
      void refresh().catch(() => {});
    }, 8000);
    return () => window.clearInterval(id);
  }, [data?.me.role]);

  async function run(action: () => Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }>, success: string) {
    setNotice(null);
    try {
      const result = await action();
      if (!result.ok) {
        setNotice(result.error);
        setError(result.error);
        return;
      }
      setData(result.data);
      setError(null);
      setNotice(success);
    } catch {
      setError("La operación no se confirmó. Revise la conexión.");
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-foam text-muted">
        <p>Cargando el consultorio…</p>
      </main>
    );
  }

  if (needsProfile) return <CompleteProfile onDone={(next) => { setData(next); setNeedsProfile(false); }} />;

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-foam px-4">
        <div className="max-w-md space-y-3 text-center">
          <p role="alert" className="text-danger">{error ?? "No se pudo abrir el panel."}</p>
          <Link to="/login" className="inline-flex h-11 items-center rounded-xl bg-pine px-4 text-sm font-semibold text-foam">
            Ir al acceso
          </Link>
        </div>
      </main>
    );
  }

  const items = NAV[data.me.role];
  const active = items.some((item) => item.id === section) ? section : "inicio";

  return (
    <div data-role={data.me.role} className="min-h-screen bg-foam text-ink md:grid md:grid-cols-[16rem_1fr]">
      <aside className={`${open ? "fixed inset-0 z-30 flex" : "hidden"} bg-pine/40 md:static md:block md:bg-transparent`}>
        <div className="flex h-full w-64 flex-col bg-pine p-4 text-foam md:w-auto">
          <div className="mb-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mark light className="size-9" />
              <span className="font-display text-xl">Medi-Turnos</span>
            </div>
            <button type="button" className="md:hidden" aria-label="Cerrar menú" onClick={() => setOpen(false)}>
              <X />
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {items.map((item) => {
              const Icon = item.icon;
              const current = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    setOpen(false);
                    setNotice(null);
                  }}
                  className={`flex h-11 items-center gap-2 rounded-xl px-3 text-left text-sm font-medium ${current ? "bg-mint text-pine" : "text-foam"}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-3">
          <button type="button" className="grid size-11 place-items-center md:hidden" aria-label="Abrir menú" onClick={() => setOpen(true)}>
            <Menu />
          </button>
          <div className="min-w-0">
            <p className="truncate font-display text-xl text-pine">{data.me.name}</p>
            <p className="text-xs text-muted">{ROLE_LABEL[data.me.role]}</p>
          </div>
          <UserButton />
        </header>
        <div className="space-y-4 px-4 py-5 md:px-8">
          {error ? <Notice text={error} tone="error" /> : null}
          {notice && notice !== error ? <Notice text={notice} tone="ok" /> : null}
          {active === "inicio" ? <Home data={data} /> : null}
          {active === "turnos" ? <TurnoList data={data} onRun={run} /> : null}
          {active === "pedir" ? <Book data={data} onRun={run} /> : null}
          {active === "datos" ? <OwnData data={data} onRun={run} /> : null}
          {active === "pacientes" ? <Patients data={data} onRun={run} /> : null}
          {active === "obras" ? <Obras data={data} onRun={run} /> : null}
          {active === "historial" ? <History data={data} onRun={run} /> : null}
          {active === "agenda" ? <Agenda data={data} onRun={run} /> : null}
          {active === "estadisticas" ? <Estadisticas data={data} /> : null}
          {active === "profesionales" ? <Profesionales data={data} /> : null}
          {active === "recetas" ? <Recetas data={data} onRun={run} /> : null}
          {active === "contactos" ? <Contactos data={data} onRun={run} /> : null}
          {active === "permisos" ? <Permisos data={data} onRun={run} /> : null}
          {active === "equipo" ? <Equipo data={data} onRun={run} /> : null}
        </div>
      </div>
    </div>
  );
}

function CompleteProfile({ onDone }: { onDone: (data: Snapshot) => void }) {
  const [form, setForm] = useState({ nombre: "", dni: "", phone: "", obra: "Particular" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="grid min-h-screen place-items-center bg-foam px-4">
      <form
        className="w-full max-w-md space-y-3 rounded-2xl border border-line bg-card p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void attachOwnPatientFn({ data: form })
            .then((result) => {
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onDone(result.data);
            })
            .catch(() => setError("No se pudo guardar la ficha."))
            .finally(() => setBusy(false));
        }}
      >
        <h1 className="text-3xl text-pine">Complete su ficha</h1>
        <p className="text-sm text-muted">Su acceso todavía no tiene un paciente vinculado. No se crea una segunda cuenta.</p>
        {error ? <Notice text={error} tone="error" /> : null}
        <label className="block text-sm font-medium">Nombre<input className="field mt-1" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
        <label className="block text-sm font-medium">DNI<input className="field mt-1" required value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></label>
        <label className="block text-sm font-medium">Teléfono<input className="field mt-1" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="block text-sm font-medium">Cobertura<input className="field mt-1" required value={form.obra} onChange={(e) => setForm({ ...form, obra: e.target.value })} /></label>
        <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-pine font-semibold text-foam disabled:opacity-60">
          {busy ? "Guardando…" : "Guardar ficha"}
        </button>
      </form>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border border-line bg-card px-4 py-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display text-3xl text-pine tabular-nums">{value}</p>
    </article>
  );
}

function Home({ data }: { data: Snapshot }) {
  // Profesional: prioriza sus propios turnos; secretaría/admin ven todos
  const scope =
    data.me.role === "profesional"
      ? data.turnos.filter((t) => t.professionalUserId === data.me.userId)
      : data.turnos;

  const todayRows = scope
    .filter((turno) => turno.fecha === data.today && turno.estado !== "Cancelado")
    .sort((a, b) => a.hora.localeCompare(b.hora));
  const pendingToday = todayRows.filter((t) => t.estado === "Pendiente");
  const confirmedToday = todayRows.filter((t) => t.estado === "Confirmado");
  const attendedToday = todayRows.filter((t) => t.estado === "Atendido");
  const pendingAll = scope.filter((turno) => turno.estado === "Pendiente");
  const next = [...data.turnos]
    .filter((turno) => turno.fecha >= data.today && turno.estado !== "Cancelado" && turno.estado !== "Atendido")
    .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`))[0];

  const isStaff = data.me.role === "profesional" || data.me.role === "secretaria" || data.me.role === "admin";
  const nuevos = isStaff ? pendingAll.filter((t) => t.fecha >= data.today) : [];

  return (
    <section className="space-y-4">
      <h2 className="text-3xl text-pine">
        {data.me.role === "paciente"
          ? "Portal del paciente"
          : data.me.role === "profesional"
            ? "Mi agenda de hoy"
            : "Agenda de hoy"}
      </h2>

      {/* Banner: turnos nuevos pedidos por pacientes → doctora y secretaría */}
      {nuevos.length > 0 ? (
        <div className="alert-nuevo" role="status">
          <span className="text-2xl" aria-hidden="true">🔔</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-amber-900">
              {nuevos.length === 1
                ? "¡Nuevo turno solicitado!"
                : `¡${nuevos.length} turnos pendientes de confirmar!`}
            </p>
            <p className="text-sm text-amber-800">
              {nuevos
                .slice(0, 3)
                .map((t) => `${t.patientName} (${t.fecha} ${t.hora})`)
                .join(" · ")}
              {nuevos.length > 3 ? ` y ${nuevos.length - 3} más` : ""}
            </p>
          </div>
          <span className="badge badge-nuevo">NUEVO</span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Turnos de hoy" value={todayRows.length} />
        <Stat label="Pendientes" value={pendingToday.length} />
        <Stat label="Confirmados" value={confirmedToday.length} />
        <Stat label="Atendidos hoy" value={attendedToday.length} />
      </div>

      {data.me.role === "paciente" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Hola, <span className="font-semibold text-pine">{data.me.name}</span>. Desde acá podés ver y pedir turnos, y actualizar tus datos.
          </p>
          {next ? (
            <article className="rounded-2xl border-2 border-leaf bg-mint p-4">
              <p className="text-sm font-semibold text-pine">Próximo turno</p>
              <p className="font-display text-2xl text-pine">
                {next.fecha} · {next.hora}
              </p>
              <p className="text-sm">
                {next.professionalName} · {next.motivo}
              </p>
              <div className="mt-2">
                <EstadoBadge estado={next.estado} />
              </div>
            </article>
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              No tenés turnos próximos. Usá <strong>Pedir turno</strong> en el menú para solicitar uno.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-line bg-card px-4 py-3">
              <p className="text-sm text-muted">Mis turnos activos</p>
              <p className="font-display text-2xl text-pine tabular-nums">
                {data.turnos.filter((t) => t.estado === "Pendiente" || t.estado === "Confirmado").length}
              </p>
            </article>
            <article className="rounded-2xl border border-line bg-card px-4 py-3">
              <p className="text-sm text-muted">Atendidos</p>
              <p className="font-display text-2xl text-pine tabular-nums">
                {data.turnos.filter((t) => t.estado === "Atendido").length}
              </p>
            </article>
            <article className="rounded-2xl border border-line bg-card px-4 py-3">
              <p className="text-sm text-muted">Cancelados</p>
              <p className="font-display text-2xl text-pine tabular-nums">
                {data.turnos.filter((t) => t.estado === "Cancelado").length}
              </p>
            </article>
          </div>
        </div>
      ) : todayRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          No hay turnos cargados para hoy.
        </p>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Turnos de hoy</h3>
          <TurnoCards rows={todayRows} highlightPending />
        </div>
      )}
    </section>
  );
}

function TurnoCards({ rows, highlightPending }: { rows: Turno[]; highlightPending?: boolean }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
        No hay turnos para mostrar.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((turno) => {
        const isNew = highlightPending && turno.estado === "Pendiente";
        return (
          <li
            key={turno.id}
            className={`rounded-2xl border bg-card px-4 py-3 ${
              isNew ? "border-amber-400 bg-amber-50" : "border-line"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{turno.patientName}</p>
                <p className="text-sm text-muted">
                  {turno.hora}
                  {turno.motivo ? ` · ${turno.motivo}` : ""}
                  {turno.professionalName ? ` · ${turno.professionalName}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isNew ? <span className="badge badge-nuevo">NUEVO</span> : null}
                <span
                  className={`badge ${
                    turno.estado === "Pendiente"
                      ? "badge-pendiente"
                      : turno.estado === "Confirmado"
                        ? "badge-confirmado"
                        : turno.estado === "Atendido"
                          ? "badge-atendido"
                          : "badge-cancelado"
                  }`}
                >
                  {turno.estado}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const cls =
    estado === "Pendiente"
      ? "badge-pendiente"
      : estado === "Confirmado"
        ? "badge-confirmado"
        : estado === "Atendido"
          ? "badge-atendido"
          : "badge-cancelado";
  return <span className={`badge ${cls}`}>{estado}</span>;
}

function TurnoList({
  data,
  onRun,
}: {
  data: Snapshot;
  onRun: (action: () => Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }>, success: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [soloHoy, setSoloHoy] = useState(false);
  const mine = data.me.role === "paciente";
  const isStaff = !mine;

  const rows = useMemo(() => {
    let list = [...data.turnos];
    if (soloHoy) list = list.filter((t) => t.fecha === data.today);
    if (filtroEstado !== "todos") list = list.filter((t) => t.estado === filtroEstado);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.patientName.toLowerCase().includes(s) ||
          t.professionalName.toLowerCase().includes(s) ||
          t.motivo.toLowerCase().includes(s) ||
          t.fecha.includes(s),
      );
    }
    list.sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
    return list;
  }, [data.turnos, data.today, q, filtroEstado, soloHoy]);

  const pendientesNuevos = isStaff ? data.turnos.filter((t) => t.estado === "Pendiente" && t.fecha >= data.today).length : 0;

  function setEstado(id: number, estado: "Pendiente" | "Confirmado" | "Atendido" | "Cancelado", msg: string) {
    setBusy(id);
    void onRun(() => setAppointmentEstadoFn({ data: { id, estado } }), msg).finally(() => setBusy(null));
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl text-pine">{mine ? "Mis turnos" : "Turnos"}</h2>
        {pendientesNuevos > 0 ? (
          <span className="badge badge-nuevo">{pendientesNuevos} nuevos</span>
        ) : null}
      </div>

      {isStaff ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3">
          <input
            className="field max-w-xs"
            placeholder="Buscar paciente, motivo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="field max-w-[10rem]" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="todos">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Confirmado">Confirmado</option>
            <option value="Atendido">Atendido</option>
            <option value="Cancelado">Cancelado</option>
          </select>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={soloHoy} onChange={(e) => setSoloHoy(e.target.checked)} />
            Solo hoy
          </label>
          <span className="ml-auto text-xs text-muted">{rows.length} turnos</span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          {data.turnos.length === 0 ? "Todavía no hay turnos guardados." : "Ningún turno coincide con el filtro."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((turno) => {
            const isNew = isStaff && turno.estado === "Pendiente" && turno.fecha >= data.today;
            return (
              <li
                key={turno.id}
                className={`rounded-2xl border bg-card px-4 py-3 ${isNew ? "border-amber-400 bg-amber-50" : "border-line"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {mine ? turno.professionalName : turno.patientName}
                    </p>
                    <p className="text-sm tabular-nums text-muted">
                      {turno.fecha} · {turno.hora}
                      {turno.motivo ? ` · ${turno.motivo}` : ""}
                      {!mine && turno.professionalName ? ` · ${turno.professionalName}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isNew ? <span className="badge badge-nuevo">NUEVO</span> : null}
                    <EstadoBadge estado={turno.estado} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mine && turno.estado === "Pendiente" && allowed(data, "pac_turnos_editar") ? (
                    <Action label="Confirmar asistencia" busy={busy === turno.id} onClick={() => setEstado(turno.id, "Confirmado", "Asistencia confirmada.")} />
                  ) : null}
                  {mine && (turno.estado === "Pendiente" || turno.estado === "Confirmado") && turno.fecha >= data.today ? (
                    <Action label="Cancelar" busy={busy === turno.id} onClick={() => setEstado(turno.id, "Cancelado", "Turno cancelado.")} />
                  ) : null}
                  {isStaff && turno.estado === "Pendiente" ? (
                    <Action label="Confirmar" busy={busy === turno.id} onClick={() => setEstado(turno.id, "Confirmado", "Turno confirmado.")} />
                  ) : null}
                  {isStaff && turno.estado !== "Cancelado" && turno.estado !== "Atendido" ? (
                    <Action label="Marcar atendido" busy={busy === turno.id} onClick={() => setEstado(turno.id, "Atendido", "Turno marcado como atendido.")} />
                  ) : null}
                  {isStaff && turno.estado !== "Cancelado" ? (
                    <Action label="Cancelar" busy={busy === turno.id} onClick={() => setEstado(turno.id, "Cancelado", "Turno cancelado.")} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Action({ label, onClick, busy }: { label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" disabled={busy} onClick={onClick} className="h-10 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-60">
      {busy ? "Guardando…" : label}
    </button>
  );
}

function Book({
  data,
  onRun,
}: {
  data: Snapshot;
  onRun: (action: () => Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }>, success: string) => Promise<void>;
}) {
  const [prof, setProf] = useState(data.profesionales[0]?.userId ?? "");
  const [fecha, setFecha] = useState(data.today);
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("Consulta");
  const [observaciones, setObservaciones] = useState("");
  const [patientId, setPatientId] = useState(data.me.patientId ?? data.patients[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const taken = new Set(
    data.turnos
      .filter((turno) => turno.professionalUserId === prof && turno.fecha === fecha && turno.estado !== "Cancelado")
      .map((turno) => turno.hora),
  );
  const marked = useMemo(() => {
    const set = new Set<string>();
    for (const t of data.turnos) {
      if (t.professionalUserId === prof && t.estado !== "Cancelado") set.add(t.fecha);
    }
    return set;
  }, [data.turnos, prof]);
  const staff = data.me.role !== "paciente";
  const profName = data.profesionales.find((p) => p.userId === prof)?.nombre ?? "";
  const freeSlots = SLOT_HOURS.filter((s) => fecha && isWeekday(fecha) && !taken.has(s));

  return (
    <section className="space-y-4">
      <h2 className="text-3xl text-pine">{staff ? "Cargar turno" : "Pedir turno"}</h2>
      <p className="text-sm text-muted">
        {staff
          ? "Elegí paciente, profesional, día y horario disponible."
          : "Elegí profesional, día y un horario libre. El turno queda pendiente hasta que lo confirmen en recepción."}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Profesional
            <select
              className="field mt-1"
              value={prof}
              onChange={(e) => {
                setProf(e.target.value);
                setHora("");
              }}
              required
            >
              {data.profesionales.map((item) => (
                <option key={item.userId} value={item.userId}>
                  {item.nombre} · {item.specialty || "General"}
                </option>
              ))}
            </select>
          </label>
          <Month
            fecha={fecha}
            marked={marked}
            onPick={(iso) => {
              if (iso < data.today) return;
              setFecha(iso);
              setHora("");
            }}
          />
        </div>

        <form
          className="space-y-3 rounded-2xl border border-line bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!hora || !fecha) return;
            setBusy(true);
            void onRun(
              () =>
                saveAppointmentFn({
                  data: {
                    patientId: staff ? patientId : data.me.patientId,
                    professionalUserId: prof,
                    fecha,
                    hora,
                    motivo,
                    observaciones,
                  },
                }),
              staff ? "El turno quedó guardado." : "Turno solicitado. Quedó pendiente de confirmación.",
            ).finally(() => {
              setBusy(false);
              setHora("");
            });
          }}
        >
          {staff ? (
            <label className="block text-sm font-medium">
              Paciente
              <select className="field mt-1" value={patientId} onChange={(e) => setPatientId(Number(e.target.value))}>
                {data.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.nombre} · {patient.dni}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="rounded-xl bg-mint px-3 py-2 text-sm">
            <span className="font-semibold text-pine">Fecha elegida: </span>
            <span className="tabular-nums">{fecha || "—"}</span>
            {fecha && !isWeekday(fecha) ? (
              <span className="ml-2 text-danger"> (fin de semana, sin agenda)</span>
            ) : null}
          </div>

          <div>
            <p className="text-sm font-medium">Horarios disponibles</p>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {SLOT_HOURS.map((slot) => {
                const blocked = !fecha || !isWeekday(fecha) || taken.has(slot) || fecha < data.today;
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={blocked}
                    onClick={() => setHora(slot)}
                    className={`h-11 rounded-xl text-sm font-semibold tabular-nums transition ${
                      hora === slot
                        ? "bg-pine text-foam ring-2 ring-leaf"
                        : blocked
                          ? "border border-line bg-foam opacity-40"
                          : "border border-line hover:border-leaf hover:bg-mint"
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
            {fecha && isWeekday(fecha) && freeSlots.length === 0 ? (
              <p className="mt-2 text-sm text-danger">No quedan horarios libres ese día.</p>
            ) : null}
          </div>

          <label className="block text-sm font-medium">
            Motivo
            <input className="field mt-1" value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
          </label>
          <label className="block text-sm font-medium">
            Observaciones
            <textarea
              className="field-area mt-1"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Opcional"
            />
          </label>

          {hora && fecha ? (
            <div className="rounded-xl border-2 border-leaf bg-mint px-3 py-2 text-sm">
              <p className="font-semibold text-pine">Resumen</p>
              <p>
                {profName} · {fecha} · {hora} · {motivo}
              </p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy || !hora || !fecha || data.profesionales.length === 0}
            className="h-12 w-full rounded-xl bg-pine font-semibold text-foam disabled:opacity-60"
          >
            {busy ? "Enviando…" : staff ? "Guardar turno" : "Solicitar turno"}
          </button>
        </form>
      </div>
    </section>
  );
}

function OwnData({
  data,
  onRun,
}: {
  data: Snapshot;
  onRun: (action: () => Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }>, success: string) => Promise<void>;
}) {
  const patient = data.patients[0];
  const [form, setForm] = useState({
    phone: patient?.phone ?? "",
    email: patient?.email ?? data.me.email,
    obraSocial: patient?.obraSocial ?? "Particular",
    planObra: patient?.planObra ?? "",
    afiliado: patient?.afiliado ?? "",
    address: patient?.address ?? "",
  });
  const [pass, setPass] = useState({ current: "", next: "" });
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!patient) return <p className="text-sm text-muted">No hay una ficha vinculada a esta cuenta.</p>;
  return (
    <section className="space-y-4">
      <h2 className="text-3xl text-pine">Mis datos</h2>
      <form
        className="grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void onRun(() => savePatientFn({ data: { id: patient.id, ...form } }), "Datos actualizados.").finally(() => setBusy(false));
        }}
      >
        <p className="text-sm text-muted md:col-span-2">Legajo {patient.id} · {patient.nombre} · DNI {patient.dni}</p>
        <label className="text-sm font-medium">Teléfono<input className="field mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label>
        <label className="text-sm font-medium">Correo<input className="field mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label className="text-sm font-medium">Obra social<input className="field mt-1" value={form.obraSocial} onChange={(e) => setForm({ ...form, obraSocial: e.target.value })} required /></label>
        <label className="text-sm font-medium">Plan<input className="field mt-1" value={form.planObra} onChange={(e) => setForm({ ...form, planObra: e.target.value })} /></label>
        <label className="text-sm font-medium">Afiliado<input className="field mt-1" value={form.afiliado} onChange={(e) => setForm({ ...form, afiliado: e.target.value })} /></label>
        <label className="text-sm font-medium">Dirección<input className="field mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <button type="submit" disabled={busy || !allowed(data, "pac_datos_editar")} className="h-11 rounded-xl bg-pine font-semibold text-foam disabled:opacity-60 md:col-span-2">
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>
      <form
        className="grid gap-3 rounded-2xl border border-line bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPassMsg(null);
          void authClient
            .changePassword({ currentPassword: pass.current, newPassword: pass.next, revokeOtherSessions: true })
            .then((result) => {
              if (result.error) setPassMsg(result.error.message ?? "No se pudo cambiar la contraseña.");
              else setPassMsg("Contraseña actualizada.");
            })
            .catch(() => setPassMsg("No se pudo cambiar la contraseña."));
        }}
      >
        <h3 className="text-xl text-pine">Contraseña</h3>
        {passMsg ? <p className="text-sm">{passMsg}</p> : null}
        <label className="text-sm font-medium">Actual<input className="field mt-1" type="password" value={pass.current} onChange={(e) => setPass({ ...pass, current: e.target.value })} required /></label>
        <label className="text-sm font-medium">Nueva<input className="field mt-1" type="password" value={pass.next} onChange={(e) => setPass({ ...pass, next: e.target.value })} required /></label>
        <button type="submit" className="h-11 rounded-xl border border-line font-semibold">Cambiar contraseña</button>
      </form>
    </section>
  );
}

const emptyPatient = {
  id: null as number | null,
  nombre: "",
  dni: "",
  phone: "",
  email: "",
  obraSocial: "Particular",
  planObra: "",
  afiliado: "",
  address: "",
  birthDate: "",
  gender: "",
  cuil: "",
  weightKg: "",
  heightCm: "",
  status: "Habilitado",
  portalEmail: "",
  portalPassword: "",
  giveAccess: false,
};

function Patients({
  data,
  onRun,
}: {
  data: Snapshot;
  onRun: (action: () => Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }>, success: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<typeof emptyPatient | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = data.patients.filter((patient) => {
    const hay = `${patient.nombre} ${patient.dni} ${patient.obraSocial}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl text-pine">Pacientes</h2>
        <button type="button" className="h-11 rounded-xl bg-pine px-4 text-sm font-semibold text-foam" onClick={() => setEditing({ ...emptyPatient })}>
          Nuevo paciente
        </button>
      </div>
      <input className="field" placeholder="Buscar por nombre o DNI" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar pacientes" />
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">No hay pacientes para mostrar.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((patient) => (
            <li key={patient.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card px-4 py-3">
              <div>
                <p className="font-semibold">{patient.nombre}</p>
                <p className="text-sm text-muted">Legajo {patient.id} · DNI {patient.dni} · {patient.obraSocial} · {patient.status}{patient.userId ? " · con acceso" : ""}</p>
              </div>
              <button type="button" className="h-10 rounded-xl border border-line px-3 text-sm font-semibold" onClick={() => setEditing(fromPatient(patient))}>
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <form
          className="grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            const payload = {
              id: editing.id,
              ...editing,
              birthDate: editing.birthDate || null,
              portal: editing.giveAccess ? { email: editing.portalEmail || editing.email, password: editing.portalPassword } : null,
            };
            void onRun(() => savePatientFn({ data: payload }), editing.id ? "Paciente actualizado." : "Paciente guardado.").finally(() => {
              setBusy(false);
              setEditing(null);
            });
          }}
        >
          <h3 className="text-xl text-pine md:col-span-2">{editing.id ? `Editar legajo ${editing.id}` : "Nuevo paciente"}</h3>
          {(
            [
              ["nombre", "Nombre"],
              ["dni", "DNI"],
              ["phone", "Teléfono"],
              ["email", "Correo"],
              ["obraSocial", "Obra social"],
              ["planObra", "Plan"],
              ["afiliado", "Afiliado"],
              ["address", "Dirección"],
              ["gender", "Género"],
              ["cuil", "CUIL"],
              ["weightKg", "Peso (kg)"],
              ["heightCm", "Altura (cm)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm font-medium">
              {label}
              <input className="field mt-1" value={editing[key]} onChange={(e) => setEditing({ ...editing, [key]: e.target.value })} />
            </label>
          ))}
          <label className="text-sm font-medium">
            Nacimiento
            <input className="field mt-1" type="date" value={editing.birthDate} onChange={(e) => setEditing({ ...editing, birthDate: e.target.value })} />
          </label>
          <label className="text-sm font-medium">
            Estado
            <select className="field mt-1" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
              <option>Habilitado</option>
              <option>Suspendido</option>
            </select>
          </label>
          {!editing.id || true ? (
            <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
              <input type="checkbox" checked={editing.giveAccess} onChange={(e) => setEditing({ ...editing, giveAccess: e.target.checked })} />
              Crear acceso al portal (no duplica la ficha si ya tiene cuenta)
            </label>
          ) : null}
          {editing.giveAccess ? (
            <>
              <label className="text-sm font-medium">Correo de acceso<input className="field mt-1" value={editing.portalEmail} onChange={(e) => setEditing({ ...editing, portalEmail: e.target.value })} /></label>
              <label className="text-sm font-medium">Contraseña inicial<input className="field mt-1" type="password" value={editing.portalPassword} onChange={(e) => setEditing({ ...editing, portalPassword: e.target.value })} /></label>
            </>
          ) : null}
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={busy} className="h-11 rounded-xl bg-pine px-4 font-semibold text-foam disabled:opacity-60">{busy ? "Guardando…" : "Guardar"}</button>
            <button type="button" className="h-11 rounded-xl border border-line px-4" onClick={() => setEditing(null)}>Cerrar</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function fromPatient(patient: Patient): typeof emptyPatient {
  return {
    id: patient.id,
    nombre: patient.nombre,
    dni: patient.dni,
    phone: patient.phone,
    email: patient.email,
    obraSocial: patient.obraSocial,
    planObra: patient.planObra,
    afiliado: patient.afiliado,
    address: patient.address,
    birthDate: patient.birthDate ?? "",
    gender: patient.gender,
    cuil: patient.cuil,
    weightKg: patient.weightKg,
    heightCm: patient.heightCm,
    status: patient.status,
    portalEmail: "",
    portalPassword: "",
    giveAccess: false,
  };
}

function Obras({
  data,
  onRun,
}: {
  data: Snapshot;
  onRun: (action: () => Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }>, success: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Partial<Obra> | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-3xl text-pine">Obras sociales</h2>
        <button type="button" className="h-11 rounded-xl bg-pine px-4 text-sm font-semibold text-foam" onClick={() => setEditing({ nombre: "", estado: "Activa" })}>Nueva</button>
      </div>
      {data.obras.length === 0 ? <p className="text-sm text-muted">No hay coberturas cargadas.</p> : null}
      <ul className="space-y-2">
        {data.obras.map((obra) => (
          <li key={obra.id} className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3">
            <div>
              <p className="font-semibold">{obra.nombre}</p>
              <p className="text-sm text-muted">{obra.estado} · consulta {obra.cosGral || "—"}</p>
            </div>
            <button type="button" className="h-10 rounded-xl border border-line px-3 text-sm" onClick={() => setEditing(obra)}>Editar</button>
          </li>
        ))}
      </ul>
      {editing ? (
        <form
          className="grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            void onRun(() => saveObraFn({ data: editing }), "Cobertura guardada.").finally(() => {
              setBusy(false);
              setEditing(null);
            });
          }}
        >
          <label className="text-sm font-medium md:col-span-2">Nombre<input className="field mt-1" value={editing.nombre ?? ""} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} required /></label>
          <label className="text-sm font-medium">Estado
            <select className="field mt-1" value={editing.estado ?? "Activa"} onChange={(e) => setEditing({ ...editing, estado: e.target.value })}>
              <option>Activa</option>
              <option>Inactiva</option>
            </select>
          </label>
          <label className="text-sm font-medium">Consulta general<input className="field mt-1" value={editing.cosGral ?? ""} onChange={(e) => setEditing({ ...editing, cosGral: e.target.value })} /></label>
          <label className="text-sm font-medium">Especialidad<input className="field mt-1" value={editing.cosEspec ?? ""} onChange={(e) => setEditing({ ...editing, cosEspec: e.target.value })} /></label>
          <label className="text-sm font-medium">Práctica<input className="field mt-1" value={editing.cosPractica ?? ""} onChange={(e) => setEditing({ ...editing, cosPractica: e.target.value })} /></label>
          <div className="flex gap-2 md:col-span-2">
            <button disabled={busy} className="h-11 rounded-xl bg-pine px-4 font-semibold text-foam" type="submit">{busy ? "Guardando…" : "Guardar"}</button>
            <button type="button" className="h-11 rounded-xl border border-line px-4" onClick={() => setEditing(null)}>Cerrar</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function History({
  data,
  onRun,
}: {
  data: Snapshot;
  onRun: (action: () => Promise<{ ok: true; data: Snapshot } | { ok: false; error: string }>, success: string) => Promise<void>;
}) {
  const [patientId, setPatientId] = useState(data.patients[0]?.id ?? 0);
  const [texto, setTexto] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const notes = data.evoluciones.filter((item) => item.patientId === patientId);
  const patient = data.patients.find((item) => item.id === patientId);
  const patientsFiltered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data.patients;
    return data.patients.filter(
      (p) => p.nombre.toLowerCase().includes(s) || p.dni.includes(s),
    );
  }, [data.patients, q]);
  return (
    <section className="space-y-3">
      <h2 className="text-3xl text-pine">Historia clínica</h2>
      <div className="grid gap-2 md:grid-cols-2">
        <input
          className="field"
          placeholder="Buscar paciente por nombre o DNI…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar paciente"
        />
        <label className="block text-sm font-medium">
          Paciente
          <select className="field mt-1" value={patientId} onChange={(e) => setPatientId(Number(e.target.value))}>
            {patientsFiltered.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre} · DNI {item.dni}
              </option>
            ))}
          </select>
        </label>
      </div>
      {patient ? (
        <div className="rounded-2xl border border-line bg-mint px-4 py-3 text-sm">
          <p className="font-semibold text-pine">{patient.nombre}</p>
          <p className="text-muted">
            DNI {patient.dni} · {patient.obraSocial || "Particular"}
            {patient.planObra ? ` (${patient.planObra})` : ""}
            {patient.phone ? ` · ${patient.phone}` : ""}
          </p>
        </div>
      ) : null}
      {notes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Sin evoluciones cargadas para este paciente.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-2xl border border-line bg-card px-4 py-3">
              <p className="text-sm text-muted">
                {note.authorName} · {note.createdAt.slice(0, 16).replace("T", " ")}
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{note.texto}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void onRun(() => saveEvolucionFn({ data: { patientId, texto } }), "Evolución guardada.").finally(() => {
            setBusy(false);
            setTexto("");
          });
        }}
      >
        <label className="block text-sm font-medium">Nueva evolución
          <textarea className="field-area mt-1" value={texto} onChange={(e) => setTexto(e.target.value)} required />
        </label>
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-pine px-4 font-semibold text-foam disabled:opacity-60">{busy ? "Guardando…" : "Guardar evolución"}</button>
      </form>
    </section>
  );
}

function weekStartISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function Agenda({ data, onRun }: { data: Snapshot; onRun: Run }) {
  const [fecha, setFecha] = useState(data.today);
  const [vista, setVista] = useState<"semana" | "mes">("semana");
  const scope =
    data.me.role === "profesional"
      ? data.turnos.filter((t) => t.professionalUserId === data.me.userId)
      : data.turnos;
  const rows = scope.filter((turno) => turno.fecha === fecha && turno.estado !== "Cancelado");
  const marked = useMemo(() => new Set(scope.map((turno) => turno.fecha)), [scope]);
  const start = weekStartISO(fecha);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  function shiftWeek(dir: number) {
    setFecha(addDaysISO(fecha, dir * 7));
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl text-pine">Agenda</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className={`h-10 rounded-xl px-3 text-sm font-semibold ${vista === "semana" ? "bg-pine text-foam" : "border border-line"}`}
            onClick={() => setVista("semana")}
          >
            Semana
          </button>
          <button
            type="button"
            className={`h-10 rounded-xl px-3 text-sm font-semibold ${vista === "mes" ? "bg-pine text-foam" : "border border-line"}`}
            onClick={() => setVista("mes")}
          >
            Mes
          </button>
        </div>
      </div>

      {vista === "semana" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button type="button" className="h-10 rounded-xl border border-line px-3" onClick={() => shiftWeek(-1)}>
              ← Semana
            </button>
            <p className="text-sm font-semibold text-pine">
              {start} → {addDaysISO(start, 6)}
            </p>
            <button type="button" className="h-10 rounded-xl border border-line px-3" onClick={() => shiftWeek(1)}>
              Semana →
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((iso, i) => {
              const dayTurnos = scope
                .filter((t) => t.fecha === iso && t.estado !== "Cancelado")
                .sort((a, b) => a.hora.localeCompare(b.hora));
              const isToday = iso === data.today;
              const selected = iso === fecha;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setFecha(iso)}
                  className={`min-h-[8rem] rounded-2xl border p-2 text-left ${
                    selected ? "border-pine bg-mint" : isToday ? "border-leaf bg-card" : "border-line bg-card"
                  }`}
                >
                  <p className="text-xs font-bold uppercase text-muted">
                    {dayNames[i]} {iso.slice(8)}
                  </p>
                  {dayTurnos.length === 0 ? (
                    <p className="mt-2 text-xs text-muted">Libre</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {dayTurnos.slice(0, 5).map((t) => (
                        <li
                          key={t.id}
                          className={`rounded-lg px-1.5 py-0.5 text-[11px] leading-tight ${
                            t.estado === "Pendiente" ? "bg-amber-100 text-amber-900" : "bg-foam text-ink"
                          }`}
                        >
                          <span className="font-semibold tabular-nums">{t.hora}</span> {t.patientName}
                        </li>
                      ))}
                      {dayTurnos.length > 5 ? (
                        <li className="text-[10px] text-muted">+{dayTurnos.length - 5} más</li>
                      ) : null}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <Month fecha={fecha} marked={marked} onPick={setFecha} />
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Detalle · {fecha}</h3>
        <TurnoList data={{ ...data, turnos: rows }} onRun={onRun} />
      </div>
      {data.me.role !== "paciente" ? <Book data={data} onRun={onRun} /> : null}
    </section>
  );
}

const CHART_COLORS = ["#0d3b24", "#0284c7", "#dc2626", "#d97706", "#7c3aed", "#059669"];

function Estadisticas({ data }: { data: Snapshot }) {
  const scope =
    data.me.role === "profesional"
      ? data.turnos.filter((t) => t.professionalUserId === data.me.userId)
      : data.turnos;

  const porEstado = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of scope) map[t.estado] = (map[t.estado] ?? 0) + 1;
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [scope]);

  const porMotivo = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of scope) {
      const m = t.motivo?.trim() || "Sin motivo";
      map[m] = (map[m] ?? 0) + 1;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [scope]);

  const porDia = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of scope) {
      if (t.estado === "Cancelado") continue;
      map[t.fecha] = (map[t.fecha] ?? 0) + 1;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name: name.slice(5), value }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(-14);
  }, [scope]);

  const total = scope.length;
  const atendidos = scope.filter((t) => t.estado === "Atendido").length;
  const pendientes = scope.filter((t) => t.estado === "Pendiente").length;
  const confirmados = scope.filter((t) => t.estado === "Confirmado").length;
  const cancelados = scope.filter((t) => t.estado === "Cancelado").length;

  return (
    <section className="space-y-4">
      <h2 className="text-3xl text-pine">Estadísticas</h2>
      <p className="text-sm text-muted">
        {data.me.role === "profesional" ? "Resumen de tus turnos." : "Resumen general del consultorio."}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total turnos" value={total} />
        <Stat label="Pendientes" value={pendientes} />
        <Stat label="Confirmados" value={confirmados} />
        <Stat label="Atendidos" value={atendidos} />
        <Stat label="Cancelados" value={cancelados} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-line bg-card p-4">
          <h3 className="mb-3 font-semibold text-pine">Por estado</h3>
          {porEstado.length === 0 ? (
            <p className="text-sm text-muted">Sin datos.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={porEstado} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {porEstado.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-line bg-card p-4">
          <h3 className="mb-3 font-semibold text-pine">Turnos por día (últimos)</h3>
          {porDia.length === 0 ? (
            <p className="text-sm text-muted">Sin datos.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="var(--color-leaf)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
      </div>

      <article className="rounded-2xl border border-line bg-card p-4">
        <h3 className="mb-3 font-semibold text-pine">Motivos de consulta (top)</h3>
        {porMotivo.length === 0 ? (
          <p className="text-sm text-muted">Sin datos.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porMotivo} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="var(--color-pine)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </article>
    </section>
  );
}

function Month({ fecha, marked, onPick }: { fecha: string; marked: Set<string>; onPick: (iso: string) => void }) {
  const [year, month] = fecha.split("-").map(Number);
  const current = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, 1));
  const y = current.getUTCFullYear();
  const m = current.getUTCMonth();
  const firstPad = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: Array<string | null> = [...Array(firstPad).fill(null)];
  for (let day = 1; day <= count; day += 1) {
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push(iso);
  }
  const label = current.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  function shift(dir: number) {
    const next = new Date(Date.UTC(y, m + dir, 1));
    onPick(next.toISOString().slice(0, 10));
  }
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="h-10 rounded-xl border border-line px-3" onClick={() => shift(-1)}>Anterior</button>
        <p className="font-display text-xl capitalize text-pine">{label}</p>
        <button type="button" className="h-10 rounded-xl border border-line px-3" onClick={() => shift(1)}>Siguiente</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((iso, index) =>
          iso ? (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              className={`h-11 rounded-lg text-sm tabular-nums ${iso === fecha ? "bg-pine text-foam" : "bg-foam"} ${marked.has(iso) ? "font-semibold" : ""}`}
            >
              {Number(iso.slice(-2))}
            </button>
          ) : (
            <span key={`e-${index}`} />
          ),
        )}
      </div>
    </div>
  );
}

function Profesionales({ data }: { data: Snapshot }) {
  return (
    <section className="space-y-3">
      <h2 className="text-3xl text-pine">Profesionales</h2>
      {data.profesionales.length === 0 ? <p className="text-sm text-muted">No hay profesionales habilitados.</p> : null}
      <ul className="space-y-2">
        {data.profesionales.map((item) => (
          <li key={item.userId} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="font-semibold">{item.nombre}</p>
            <p className="text-sm text-muted">{item.specialty || "Sin especialidad"} · {item.licenseNo || "Sin matrícula"}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Recetas({ data, onRun }: { data: Snapshot; onRun: Run }) {
  const [patientId, setPatientId] = useState(data.patients[0]?.id ?? 0);
  const [medicamento, setMedicamento] = useState("");
  const [indicaciones, setIndicaciones] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = data.recetas.filter((item) => item.patientId === patientId);
  const patientsFiltered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data.patients;
    return data.patients.filter(
      (p) => p.nombre.toLowerCase().includes(s) || p.dni.includes(s),
    );
  }, [data.patients, q]);
  return (
    <section className="space-y-3">
      <h2 className="text-3xl text-pine">Recetas</h2>
      <p className="text-sm text-muted">
        El registro queda en la ficha del paciente. La receta electrónica oficial no forma parte de este sistema.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <input
          className="field"
          placeholder="Buscar paciente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar paciente"
        />
        <label className="block text-sm font-medium">
          Paciente
          <select className="field mt-1" value={patientId} onChange={(e) => setPatientId(Number(e.target.value))}>
            {patientsFiltered.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre} · DNI {item.dni}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Sin recetas registradas para este paciente.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((item) => (
            <li key={item.id} className="rounded-2xl border border-line bg-card px-4 py-3 text-sm">
              <p className="font-semibold">{item.medicamento}</p>
              <p className="text-muted">
                {item.indicaciones} · {item.authorName} · {item.createdAt.slice(0, 10)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-2 rounded-2xl border border-line bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void onRun(() => saveRecetaFn({ data: { patientId, medicamento, indicaciones } }), "Receta registrada.").finally(() => {
            setBusy(false);
            setMedicamento("");
            setIndicaciones("");
          });
        }}
      >
        <h3 className="text-lg text-pine">Nueva receta</h3>
        <label className="block text-sm font-medium">
          Medicamento
          <input className="field mt-1" value={medicamento} onChange={(e) => setMedicamento(e.target.value)} required />
        </label>
        <label className="block text-sm font-medium">
          Indicaciones
          <textarea className="field-area mt-1" value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} />
        </label>
        <button disabled={busy} className="h-11 rounded-xl bg-pine px-4 font-semibold text-foam" type="submit">
          {busy ? "Guardando…" : "Registrar receta"}
        </button>
      </form>
    </section>
  );
}

function Contactos({ data, onRun }: { data: Snapshot; onRun: Run }) {
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data.contactos;
    return data.contactos.filter(
      (c) =>
        c.nombre.toLowerCase().includes(s) ||
        c.rol.toLowerCase().includes(s) ||
        c.telefono.toLowerCase().includes(s) ||
        (c.email || "").toLowerCase().includes(s),
    );
  }, [data.contactos, q]);
  return (
    <section className="space-y-3">
      <h2 className="text-3xl text-pine">Contactos</h2>
      <input className="field" placeholder="Buscar contacto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar contactos" />
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          {data.contactos.length === 0 ? "Sin contactos cargados." : "Ningún contacto coincide."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((item) => (
            <li key={item.id} className="rounded-2xl border border-line bg-card px-4 py-3 text-sm">
              <p className="font-semibold">{item.nombre}</p>
              <p className="text-muted">
                {item.rol || "—"} · {item.telefono || "sin tel."}
                {item.email ? ` · ${item.email}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2 rounded-2xl border border-line bg-card p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void onRun(() => saveContactoFn({ data: { nombre, rol, telefono, email } }), "Contacto guardado.").finally(() => {
            setBusy(false);
            setNombre("");
            setRol("");
            setTelefono("");
            setEmail("");
          });
        }}
      >
        <h3 className="text-lg text-pine md:col-span-2">Nuevo contacto</h3>
        <input className="field" placeholder="Nombre" aria-label="Nombre del contacto" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <input className="field" placeholder="Rol / empresa" aria-label="Rol del contacto" value={rol} onChange={(e) => setRol(e.target.value)} />
        <input className="field" placeholder="Teléfono" aria-label="Teléfono del contacto" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <input className="field" placeholder="Email" aria-label="Email del contacto" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button disabled={busy} className="h-11 rounded-xl bg-pine font-semibold text-foam md:col-span-2" type="submit">
          {busy ? "Guardando…" : "Agregar contacto"}
        </button>
      </form>
    </section>
  );
}

const PERM_LABEL: Record<string, string> = {
  pac_turnos_ver: "Ve sus turnos",
  pac_turnos_agregar: "Reserva turnos",
  pac_turnos_editar: "Confirma o cancela",
  pac_datos_ver: "Ve su ficha",
  pac_datos_editar: "Edita su ficha",
  prof_agenda_ver: "Ve la agenda",
  prof_agenda_agregar: "Crea turnos",
  prof_agenda_editar: "Cambia turnos",
  prof_hc_ver: "Ver historia clínica",
  prof_hc_editar: "Escribir historia clínica",
  sec_pacientes_ver: "Ve pacientes",
  sec_pacientes_agregar: "Crea pacientes",
  sec_pacientes_editar: "Edita pacientes",
  sec_turnos_ver: "Ve turnos",
  sec_turnos_agregar: "Crea turnos",
  sec_turnos_editar: "Cambia turnos",
  sec_obras_ver: "Ve obras sociales",
  sec_obras_editar: "Edita obras sociales",
};

const PERM_GROUPS: Array<{ title: string; prefix: string; color: string }> = [
  { title: "Paciente", prefix: "pac_", color: "border-emerald-300" },
  { title: "Profesional", prefix: "prof_", color: "border-sky-300" },
  { title: "Secretaría", prefix: "sec_", color: "border-red-300" },
];

function Permisos({ data, onRun }: { data: Snapshot; onRun: Run }) {
  const grouped = PERM_GROUPS.map((g) => ({
    ...g,
    items: data.permisos.filter((p) => p.clave.startsWith(g.prefix)),
  }));
  const otros = data.permisos.filter(
    (p) => !PERM_GROUPS.some((g) => p.clave.startsWith(g.prefix)),
  );
  const activos = data.permisos.filter((p) => p.enabled).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl text-pine">Permisos</h2>
          <p className="text-sm text-muted">
            Consola master · {activos}/{data.permisos.length} activos
          </p>
        </div>
      </div>

      {grouped.map((g) =>
        g.items.length === 0 ? null : (
          <article key={g.prefix} className={`rounded-2xl border-2 bg-card p-4 ${g.color}`}>
            <h3 className="mb-3 font-semibold text-pine">{g.title}</h3>
            <ul className="space-y-2">
              {g.items.map((item) => (
                <li
                  key={item.clave}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-foam px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{PERM_LABEL[item.clave] ?? item.clave}</p>
                    <p className="text-xs text-muted">{item.clave}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.enabled}
                    className={`relative h-8 w-14 shrink-0 rounded-full transition ${
                      item.enabled ? "bg-leaf" : "bg-line"
                    }`}
                    onClick={() =>
                      void onRun(
                        () => setPermisoFn({ data: { clave: item.clave, enabled: !item.enabled } }),
                        item.enabled ? "Permiso desactivado." : "Permiso activado.",
                      )
                    }
                  >
                    <span
                      className={`absolute top-1 size-6 rounded-full bg-white shadow transition ${
                        item.enabled ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </article>
        ),
      )}

      {otros.length > 0 ? (
        <article className="rounded-2xl border border-line bg-card p-4">
          <h3 className="mb-3 font-semibold text-pine">Otros</h3>
          <ul className="space-y-2">
            {otros.map((item) => (
              <li
                key={item.clave}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-foam px-3 py-2"
              >
                <span className="text-sm">{PERM_LABEL[item.clave] ?? item.clave}</span>
                <button
                  type="button"
                  className={`h-10 rounded-xl px-3 text-sm font-semibold ${
                    item.enabled ? "bg-mint text-pine" : "bg-danger-bg text-danger"
                  }`}
                  onClick={() =>
                    void onRun(
                      () => setPermisoFn({ data: { clave: item.clave, enabled: !item.enabled } }),
                      "Permiso actualizado.",
                    )
                  }
                >
                  {item.enabled ? "Activo" : "Apagado"}
                </button>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}

function Equipo({ data, onRun }: { data: Snapshot; onRun: Run }) {
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    username: "",
    password: "",
    role: "secretaria",
    specialty: "",
    licenseNo: "",
    phone: "",
  });
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-4">
      <h2 className="text-3xl text-pine">Equipo</h2>
      <ul className="space-y-2">
        {data.usuarios.map((user) => (
          <li key={user.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card px-4 py-3">
            <div>
              <p className="font-semibold">{user.name}</p>
              <p className="text-sm text-muted">{ROLE_LABEL[user.role]} · {user.username ?? user.email} · {user.status}</p>
            </div>
            {user.userId !== data.me.userId ? (
              <button
                type="button"
                className="h-10 rounded-xl border border-line px-3 text-sm"
                onClick={() =>
                  void onRun(
                    () => setUserStatusFn({ data: { userId: user.userId, status: user.status === "Habilitado" ? "Suspendido" : "Habilitado" } }),
                    "Estado de la cuenta actualizado.",
                  )
                }
              >
                {user.status === "Habilitado" ? "Suspender" : "Habilitar"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void onRun(() => createStaffFn({ data: form }), "Cuenta de equipo creada.").finally(() => setBusy(false));
        }}
      >
        <h3 className="text-xl text-pine md:col-span-2">Nueva cuenta</h3>
        <label className="text-sm font-medium">Nombre<input className="field mt-1" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
        <label className="text-sm font-medium">Correo<input className="field mt-1" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="text-sm font-medium">Usuario<input className="field mt-1" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label className="text-sm font-medium">Contraseña<input className="field mt-1" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <label className="text-sm font-medium">Rol
          <select className="field mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="secretaria">Secretaría</option>
            <option value="profesional">Profesional</option>
            <option value="admin">Administración</option>
          </select>
        </label>
        <label className="text-sm font-medium">Especialidad<input className="field mt-1" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></label>
        <label className="text-sm font-medium">Matrícula<input className="field mt-1" value={form.licenseNo} onChange={(e) => setForm({ ...form, licenseNo: e.target.value })} /></label>
        <button disabled={busy} className="h-11 rounded-xl bg-pine font-semibold text-foam md:col-span-2" type="submit">{busy ? "Guardando…" : "Crear cuenta"}</button>
      </form>
    </section>
  );
}
