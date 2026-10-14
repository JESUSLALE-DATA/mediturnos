import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { Mark } from "@/components/mark";
import { DEMO_PASSWORD } from "@/lib/mediturnos/demo";
import { ROLE_LABEL, type Role } from "@/lib/mediturnos/validate";

const OBRAS = ["Particular", "OSDE", "Swiss Medical", "Galeno", "Medicus"];

function keepToken(token: unknown) {
  if (typeof token !== "string" || !token) return;
  try {
    sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* session storage can be blocked; the cookie still applies outside the preview */
  }
}

export function AuthScreen({ rol, dbDown }: { rol: Role; dbDown: boolean }) {
  const [tab, setTab] = useState<"login" | "alta">(rol === "paciente" ? "login" : "login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    dni: "",
    phone: "",
    obra: "Particular",
    password: "",
    confirm: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "ok">("error");
  const [busy, setBusy] = useState(false);

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/clinic/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password, rol }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; token?: string | null };
      if (!response.ok || !data.ok) {
        setTone("error");
        setMessage(data.error ?? "No se pudo iniciar sesión.");
        return;
      }
      keepToken(data.token);
      window.location.assign("/panel");
    } catch {
      setTone("error");
      setMessage("Sin conexión con el servidor. No se inició sesión.");
    } finally {
      setBusy(false);
    }
  }

  async function onRegister(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/clinic/register", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        signedIn?: boolean;
        error?: string;
        token?: string | null;
      };
      if (!response.ok || !data.ok) {
        setTone("error");
        setMessage(data.error ?? "No se pudo crear la cuenta.");
        return;
      }
      if (data.signedIn === false) {
        setTone("ok");
        setMessage(data.error ?? "Cuenta guardada. Inicie sesión.");
        setTab("login");
        setIdentifier(form.email);
        return;
      }
      keepToken(data.token);
      window.location.assign("/panel");
    } catch {
      setTone("error");
      setMessage("Sin conexión. La cuenta no se confirmó.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-foam px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-card">
        <div className="bg-pine px-6 py-6 text-foam">
          <Mark light className="size-11" />
          <h1 className="mt-3 text-3xl">Medi-Turnos</h1>
          <p className="text-sm text-mint">Acceso {ROLE_LABEL[rol]}</p>
        </div>
        <div className="space-y-4 px-6 py-6">
          {dbDown ? (
            <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">
              La base de datos no responde. No se puede ingresar ni registrar.
            </p>
          ) : null}
          {rol === "paciente" ? (
            <div className="grid grid-cols-2 rounded-xl bg-mint p-1 text-sm font-semibold">
              <button
                type="button"
                className={`h-10 rounded-lg ${tab === "login" ? "bg-card text-pine" : "text-muted"}`}
                onClick={() => {
                  setTab("login");
                  setMessage(null);
                }}
              >
                Ingresar
              </button>
              <button
                type="button"
                className={`h-10 rounded-lg ${tab === "alta" ? "bg-card text-pine" : "text-muted"}`}
                onClick={() => {
                  setTab("alta");
                  setMessage(null);
                }}
              >
                Crear cuenta
              </button>
            </div>
          ) : null}
          {message ? (
            <p
              role="alert"
              className={`rounded-xl px-3 py-2 text-sm ${tone === "error" ? "bg-danger-bg text-danger" : "bg-mint text-pine"}`}
            >
              {message}
            </p>
          ) : null}
          {tab === "login" ? (
            <form className="space-y-3" onSubmit={onLogin}>
              <label className="block text-sm font-medium">
                Correo, usuario o DNI
                <input
                  className="field mt-1"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                Contraseña
                <input
                  className="field mt-1"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                disabled={busy || dbDown}
                className="h-11 w-full rounded-xl bg-pine text-sm font-semibold text-foam disabled:opacity-60"
              >
                {busy ? "Verificando…" : "Ingresar"}
              </button>
              <p className="text-center text-xs text-muted">
                Práctica: usuario según el rol, clave {DEMO_PASSWORD}
              </p>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={onRegister}>
              {(
                [
                  ["nombre", "Nombre completo", "text"],
                  ["email", "Correo electrónico", "email"],
                  ["dni", "DNI", "text"],
                  ["phone", "Teléfono", "tel"],
                ] as const
              ).map(([key, label, type]) => (
                <label key={key} className="block text-sm font-medium">
                  {label}
                  <input
                    className="field mt-1"
                    type={type}
                    required
                    value={form[key]}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  />
                </label>
              ))}
              <label className="block text-sm font-medium">
                Obra social
                <select
                  className="field mt-1"
                  value={form.obra}
                  onChange={(event) => setForm({ ...form, obra: event.target.value })}
                >
                  {OBRAS.map((obra) => (
                    <option key={obra}>{obra}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Contraseña
                <input
                  className="field mt-1"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </label>
              <label className="block text-sm font-medium">
                Repetir contraseña
                <input
                  className="field mt-1"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.confirm}
                  onChange={(event) => setForm({ ...form, confirm: event.target.value })}
                />
              </label>
              <p className="text-xs text-muted">Mínimo 8 caracteres, con una letra y un número. El correo no requiere verificación.</p>
              <button
                type="submit"
                disabled={busy || dbDown}
                className="h-11 w-full rounded-xl bg-pine text-sm font-semibold text-foam disabled:opacity-60"
              >
                {busy ? "Guardando…" : "Crear cuenta e ingresar"}
              </button>
            </form>
          )}
          <div className="space-y-2">
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                className="h-11 w-full rounded-xl border border-line text-sm font-semibold"
                onClick={() => void signIn(provider.providerId, { callbackURL: "/panel" })}
              >
                Continuar con {provider.label}
              </button>
            ))}
          </div>
          <Link to="/" className="block text-center text-sm font-semibold text-leaf">
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
