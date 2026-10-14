import { createFileRoute } from "@tanstack/react-router";
import { registerPatient } from "@/lib/mediturnos/clinic.server";

type AuthPayload = { token?: string | null };

export const Route = createFileRoute("/api/clinic/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Datos incompletos." }, { status: 400 });
        }
        let created: Awaited<ReturnType<typeof registerPatient>>;
        try {
          created = await registerPatient(body);
        } catch (error) {
          console.error("[mediturnos] register", error);
          return Response.json(
            { ok: false, error: "No se pudo registrar. La base de datos no confirmó el alta." },
            { status: 503 },
          );
        }
        if (!created.ok) {
          const status = /ya existe/i.test(created.error) ? 409 : 400;
          return Response.json({ ok: false, error: created.error }, { status });
        }
        const password =
          body && typeof body === "object" ? String((body as { password?: string }).password ?? "") : "";
        const { auth } = await import("@/lib/auth/server");
        const upstream = await auth.api.signInEmail({
          body: { email: created.email, password, rememberMe: true },
          headers: request.headers,
          asResponse: true,
        });
        if (!upstream.ok) {
          return Response.json(
            {
              ok: true,
              signedIn: false,
              error: "La cuenta quedó guardada. Inicie sesión con su correo y contraseña.",
            },
            { status: 201 },
          );
        }
        let payload: AuthPayload = {};
        try {
          payload = (await upstream.json()) as AuthPayload;
        } catch {
          payload = {};
        }
        const headers = new Headers({ "content-type": "application/json" });
        for (const cookie of upstream.headers.getSetCookie()) headers.append("set-cookie", cookie);
        return new Response(
          JSON.stringify({ ok: true, signedIn: true, role: "paciente", token: payload.token ?? null }),
          { status: 201, headers },
        );
      },
    },
  },
});
