/** Practice-clinic accounts. Passwords are hashed at rest; this label is the known practice secret. */
export const DEMO_PASSWORD = "Medi1234";

export const DEMO_ACCOUNTS = [
  { rol: "Administración", usuario: "admin", email: "admin@mediturnos.com" },
  { rol: "Secretaría", usuario: "secretaria", email: "secretaria@mediturnos.com" },
  { rol: "Profesional", usuario: "doctora", email: "maria.gonzalez@mediturnos.com" },
  { rol: "Paciente", usuario: "paciente o 32456789", email: "juan.perez@mail.com" },
] as const;
