-- Medi-Turnos clinical schema. Auth identity lives in "user" (0001_auth.sql).
-- Patient rows are separate from login accounts: user_id is nullable until
-- the person is given portal access, so a chart is never a second account.

create table if not exists profiles (
  user_id text primary key references "user" (id) on delete cascade,
  role text not null check (role in ('admin', 'secretaria', 'profesional', 'paciente')),
  username text,
  status text not null default 'Habilitado' check (status in ('Habilitado', 'Suspendido')),
  specialty text not null default '',
  license_no text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_idx
  on profiles (lower(username))
  where username is not null;

create table if not exists patients (
  id serial primary key,
  user_id text unique references "user" (id) on delete set null,
  nombre text not null,
  dni text not null,
  phone text not null default '',
  email text not null default '',
  obra_social text not null default 'Particular',
  plan_obra text not null default '',
  afiliado text not null default '',
  address text not null default '',
  birth_date date,
  gender text not null default '',
  cuil text not null default '',
  weight_kg text not null default '',
  height_cm text not null default '',
  status text not null default 'Habilitado' check (status in ('Habilitado', 'Suspendido')),
  created_at timestamptz not null default now()
);

create unique index if not exists patients_dni_idx on patients (dni);

create table if not exists obras (
  id serial primary key,
  nombre text not null unique,
  estado text not null default 'Activa' check (estado in ('Activa', 'Inactiva')),
  cos_gral text not null default '',
  cos_espec text not null default '',
  cos_practica text not null default '',
  cos_estudio text not null default '',
  contacto text not null default '',
  telefono text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists turnos (
  id serial primary key,
  patient_id integer not null references patients (id),
  professional_user_id text not null references "user" (id),
  fecha date not null,
  hora text not null,
  motivo text not null,
  observaciones text not null default '',
  estado text not null check (estado in ('Pendiente', 'Confirmado', 'Atendido', 'Cancelado')),
  created_by text not null references "user" (id),
  created_at timestamptz not null default now()
);

-- One active booking per professional, date and time. Cancelled rows free the slot.
create unique index if not exists turnos_slot_active_idx
  on turnos (professional_user_id, fecha, hora)
  where estado <> 'Cancelado';

create index if not exists turnos_patient_idx on turnos (patient_id);
create index if not exists turnos_fecha_idx on turnos (fecha);

create table if not exists evoluciones (
  id serial primary key,
  patient_id integer not null references patients (id),
  author_user_id text not null references "user" (id),
  turno_id integer references turnos (id),
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists evoluciones_patient_idx on evoluciones (patient_id, created_at desc);

create table if not exists recetas (
  id serial primary key,
  patient_id integer not null references patients (id),
  author_user_id text not null references "user" (id),
  medicamento text not null,
  indicaciones text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists recetas_patient_idx on recetas (patient_id, created_at desc);

create table if not exists contactos (
  id serial primary key,
  nombre text not null,
  rol text not null default '',
  telefono text not null default '',
  email text not null default '',
  notas text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists permisos (
  clave text primary key,
  enabled boolean not null default true
);

create table if not exists login_attempts (
  identifier text primary key,
  failures integer not null default 0,
  locked_until timestamptz
);
