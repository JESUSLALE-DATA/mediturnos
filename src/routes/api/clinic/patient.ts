import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { readPatientGuard } from "@/lib/mediturnos/clinic.server";
import { requireUserId, UnauthorizedError } from "@/lib/auth/verify.server";

export const Route = createFileRoute("/api/clinic/patient")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const header = request.headers.get("authorization") ?? "";
        const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
        let userId: string;
        try {
          userId = await requireUserId(token);
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            return Response.json({ ok: false, error: "Debe iniciar sesión." }, { status: 401 });
          }
          throw error;
        }
        const id = Number(new URL(request.url).searchParams.get("id"));
        if (!Number.isInteger(id) || id <= 0) {
          return Response.json({ ok: false, error: "Paciente no válido." }, { status: 400 });
        }
        const guard = await readPatientGuard(userId, id);
        if (!guard.ok) return Response.json(guard, { status: 403 });
        const sql = await getSql();
        const rows = await sql<{
          id: number;
          nombre: string;
          dni: string;
          phone: string;
          email: string;
          obra_social: string;
        }>`
          select id, nombre, dni, phone, email, obra_social from patients where id = ${id}
        `;
        if (!rows[0]) return Response.json({ ok: false, error: "Paciente no encontrado." }, { status: 404 });
        return Response.json({ ok: true, patient: rows[0] });
      },
    },
  },
});
