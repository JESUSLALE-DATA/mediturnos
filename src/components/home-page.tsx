import { Link } from "@tanstack/react-router";
import { ClipboardList, Shield, Stethoscope, UserRound } from "lucide-react";
import { Mark } from "@/components/mark";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/mediturnos/demo";

const entries = [
  {
    rol: "admin",
    title: "Administración",
    text: "Permisos, equipo y control del consultorio.",
    icon: Shield,
  },
  {
    rol: "secretaria",
    title: "Secretaría",
    text: "Pacientes, obras sociales y agenda del día.",
    icon: ClipboardList,
  },
  {
    rol: "profesional",
    title: "Profesional",
    text: "Turnos, historia clínica y recetas.",
    icon: Stethoscope,
  },
  {
    rol: "paciente",
    title: "Pacientes",
    text: "Reservar, confirmar y ver sus propios turnos.",
    icon: UserRound,
  },
] as const;

export function HomePage({ dbDown }: { dbDown: boolean }) {
  return (
    <main className="min-h-screen bg-foam text-ink">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-5 md:px-8">
        <Mark />
        <div>
          <p className="font-display text-xl text-pine">Medi-Turnos</p>
          <p className="text-sm text-muted">Consultorio · turnos y fichas</p>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-16 md:grid-cols-[1.1fr_0.9fr] md:px-8">
        <section>
          <p className="text-sm font-semibold tracking-wide text-leaf uppercase">Libro de guardia</p>
          <h1 className="mt-2 max-w-xl text-4xl text-pine md:text-5xl">
            Turnos, pacientes y equipo en un solo lugar.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
            Cada rol entra por su acceso. Las contraseñas se guardan cifradas y un paciente solo ve su propia ficha.
          </p>
          {dbDown ? (
            <p role="alert" className="mt-5 rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">
              La base de datos no está disponible. No se cargó la clínica y no se guardó ningún dato.
            </p>
          ) : null}
          <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-lg text-pine">Cuentas de práctica</h2>
              <p className="text-sm text-muted">
                Clave compartida: <span className="font-semibold text-ink">{DEMO_PASSWORD}</span>. La clave 1234 quedó
                rechazada a propósito.
              </p>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Rol</th>
                  <th className="px-4 py-2 font-medium">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_ACCOUNTS.map((account) => (
                  <tr key={account.usuario} className="border-t border-line">
                    <td className="px-4 py-2">{account.rol}</td>
                    <td className="px-4 py-2 font-medium">{account.usuario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="flex flex-col gap-3">
          {entries.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.rol}
                to="/login"
                search={{ rol: entry.rol }}
                className="flex items-center gap-4 rounded-2xl border border-line bg-card px-4 py-4 transition hover:border-leaf"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-mint text-pine">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <strong className="block text-base text-pine">{entry.title}</strong>
                  <span className="text-sm text-muted">{entry.text}</span>
                </span>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
