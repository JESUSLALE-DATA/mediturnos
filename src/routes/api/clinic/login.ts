import { createFileRoute } from "@tanstack/react-router";
import { DEMO_PASSWORD } from "@/lib/mediturnos/demo";
import {
  clearLoginFailures,
  recordLoginFailure,
  resolveLogin,
  revokeSessions,
} from "@/lib/mediturnos/clinic.server";
import { clientIp, isRole } from "@/lib/mediturnos/validate";

type AuthPayload = { token?: string | null; user?: { id?: string } };

async function signIn(request: Request, email: string, password: string): Promise<Response> {
  const { auth } = await import("@/lib/auth/server");
  return auth.api.signInEmail({
    body: { email, password, rememberMe: true },
    headers: request.headers,
    asResponse: true,
  });
}

export const Route = createFileRoute("/api/clinic/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { identifier?: string; password?: string; rol?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ ok: false, error: "Datos incompletos." }, { status: 400 });
        }
        const identifier = String(body.identifier ?? "").trim();
        const password = String(body.password ?? "");
        const rol = body.rol;
        if (!identifier || !password) {
          return Response.json(
            { ok: false, error: "Usuario y contraseña son obligatorios." },
            { status: 400 },
          );
        }
        if (rol != null && rol !== "" && !isRole(rol)) {
          return Response.json({ ok: false, error: "El acceso indicado no existe." }, { status: 400 });
        }
        const ip = clientIp(request.headers);
        if (password === "1234") {
          await recordLoginFailure(identifier, ip);
          return Response.json(
            {
              ok: false,
              error: `La clave 1234 ya no es válida. Las cuentas de práctica usan ${DEMO_PASSWORD}.`,
            },
            { status: 401 },
          );
        }
        let resolved: Awaited<ReturnType<typeof resolveLogin>>;
        try {
          resolved = await resolveLogin(identifier, ip);
        } catch (error) {
          console.error("[mediturnos] login", error);
          return Response.json(
            { ok: false, error: "No se pudo verificar la cuenta. La base de datos no respondió." },
            { status: 503 },
          );
        }
        if (resolved.kind === "locked") {
          return Response.json(
            { ok: false, error: "Demasiados intentos. Espere 15 minutos e intente de nuevo." },
            { status: 429 },
          );
        }
        if (resolved.kind === "unknown") {
          const state = await recordLoginFailure(identifier, ip);
          return Response.json(
            {
              ok: false,
              error:
                state === "locked"
                  ? "Demasiados intentos. Espere 15 minutos e intente de nuevo."
                  : "Credenciales incorrectas.",
            },
            { status: 401 },
          );
        }
        const upstream = await signIn(request, resolved.email, password);
        if (!upstream.ok) {
          const state = await recordLoginFailure(identifier, ip);
          return Response.json(
            {
              ok: false,
              error:
                state === "locked"
                  ? "Demasiados intentos. Espere 15 minutos e intente de nuevo."
                  : "Credenciales incorrectas.",
            },
            { status: 401 },
          );
        }
        if (resolved.status !== "Habilitado") {
          await revokeSessions(resolved.userId);
          return Response.json(
            { ok: false, error: "La cuenta está suspendida. Consulte en recepción." },
            { status: 403 },
          );
        }
        if (rol && resolved.role !== rol) {
          await revokeSessions(resolved.userId);
          return Response.json(
            {
              ok: false,
              error: "Esta cuenta corresponde a otro acceso. Use el ingreso de su rol.",
            },
            { status: 403 },
          );
        }
        await clearLoginFailures(identifier, ip);
        let payload: AuthPayload = {};
        try {
          payload = (await upstream.json()) as AuthPayload;
        } catch {
          payload = {};
        }
        const headers = new Headers({ "content-type": "application/json" });
        for (const cookie of upstream.headers.getSetCookie()) headers.append("set-cookie", cookie);
        return new Response(
          JSON.stringify({
            ok: true,
            role: resolved.role,
            token: payload.token ?? null,
          }),
          { status: 200, headers },
        );
      },
    },
  },
});
