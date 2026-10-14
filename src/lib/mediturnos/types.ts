import type { Role, TurnoEstado } from "./validate";

export type Patient = {
  id: number;
  userId: string | null;
  nombre: string;
  dni: string;
  phone: string;
  email: string;
  obraSocial: string;
  planObra: string;
  afiliado: string;
  address: string;
  birthDate: string | null;
  gender: string;
  cuil: string;
  weightKg: string;
  heightCm: string;
  status: string;
};

export type Turno = {
  id: number;
  patientId: number;
  patientName: string;
  professionalUserId: string;
  professionalName: string;
  fecha: string;
  hora: string;
  motivo: string;
  observaciones: string;
  estado: TurnoEstado;
};

export type Profesional = {
  userId: string;
  nombre: string;
  specialty: string;
  licenseNo: string;
  status: string;
};

export type Obra = {
  id: number;
  nombre: string;
  estado: string;
  cosGral: string;
  cosEspec: string;
  cosPractica: string;
  cosEstudio: string;
  contacto: string;
  telefono: string;
  email: string;
};

export type Evolucion = {
  id: number;
  patientId: number;
  patientName: string;
  authorName: string;
  turnoId: number | null;
  texto: string;
  createdAt: string;
};

export type Receta = {
  id: number;
  patientId: number;
  patientName: string;
  authorName: string;
  medicamento: string;
  indicaciones: string;
  createdAt: string;
};

export type Contacto = {
  id: number;
  nombre: string;
  rol: string;
  telefono: string;
  email: string;
  notas: string;
};

export type Permiso = { clave: string; enabled: boolean };

export type StaffUser = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  username: string | null;
  status: string;
  specialty: string;
};

export type Me = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  username: string | null;
  status: string;
  specialty: string;
  licenseNo: string;
  phone: string;
  patientId: number | null;
};

export type Snapshot = {
  me: Me;
  today: string;
  patients: Patient[];
  turnos: Turno[];
  profesionales: Profesional[];
  obras: Obra[];
  evoluciones: Evolucion[];
  recetas: Receta[];
  contactos: Contacto[];
  permisos: Permiso[];
  usuarios: StaffUser[];
};

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; error: string };
