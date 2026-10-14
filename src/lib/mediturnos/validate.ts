export const ROLES = ["admin", "secretaria", "profesional", "paciente"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administración",
  secretaria: "Secretaría",
  profesional: "Profesional",
  paciente: "Paciente",
};

export const SLOT_HOURS = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
] as const;

export const TURNOS_ESTADOS = ["Pendiente", "Confirmado", "Atendido", "Cancelado"] as const;
export type TurnoEstado = (typeof TURNOS_ESTADOS)[number];

export function parseRole(value: unknown): Role {
  return ROLES.includes(value as Role) ? (value as Role) : "paciente";
}

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 120) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeDni(raw: string): string | null {
  const dni = raw.replace(/\D/g, "");
  if (dni.length < 7 || dni.length > 10) return null;
  return dni;
}

export function normalizeName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 80) return null;
  if (!/^[\p{L}][\p{L}\p{M}'’.\- ]+$/u.test(name)) return null;
  return name;
}

export function normalizeUsername(raw: string): string | null {
  const username = raw.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return null;
  return username;
}

export function normalizePhone(raw: string): string | null {
  const phone = raw.trim().replace(/\s+/g, " ");
  if (phone.length < 6 || phone.length > 30) return null;
  if (!/^[0-9+()\-.\s]+$/.test(phone)) return null;
  return phone;
}

/** Returns an error message, or null when the password is acceptable. */
export function validatePassword(password: string): string | null {
  if (password.length < 8 || password.length > 72) {
    return "La contraseña debe tener entre 8 y 72 caracteres.";
  }
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) || !/\d/.test(password)) {
    return "La contraseña debe incluir al menos una letra y un número.";
  }
  return null;
}

export function cleanText(raw: string, min: number, max: number): string | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) return null;
  if (/[<>]/.test(text)) return null;
  return text;
}

export function isIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

export function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isWeekday(iso: string): boolean {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

export function todayAR(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function withinBookingWindow(iso: string, today: string): boolean {
  return isIsoDate(iso) && iso >= today && iso <= shiftDate(today, 180);
}

export function loginKey(ip: string, identifier: string): string {
  const id = identifier.trim().toLowerCase();
  const digits = id.replace(/\D/g, "");
  const compact = id.replace(/[.\s-]/g, "");
  const norm = digits.length >= 7 && digits === compact ? digits : id;
  return `${ip.slice(0, 64)}|${norm.slice(0, 80)}`;
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim().slice(0, 64) || "local";
  return "local";
}
