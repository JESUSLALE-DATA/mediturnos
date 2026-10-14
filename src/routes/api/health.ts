import { createFileRoute } from "@tanstack/react-router";
import { pingDatabase } from "@/lib/mediturnos/clinic.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const up = await pingDatabase();
        if (!up) {
          return Response.json(
            { ok: false, service: "mediturnos", db: "down" },
            { status: 503 },
          );
        }
        return Response.json({ ok: true, service: "mediturnos", db: "up" });
      },
    },
  },
});
