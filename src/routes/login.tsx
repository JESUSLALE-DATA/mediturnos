import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/auth-screen";
import { ensureClinic } from "@/lib/mediturnos/fns";
import { parseRole } from "@/lib/mediturnos/validate";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    rol: parseRole(search.rol),
  }),
  loader: async () => ensureClinic(),
  component: LoginRoute,
});

function LoginRoute() {
  const { rol } = Route.useSearch();
  const status = Route.useLoaderData();
  return <AuthScreen rol={rol} dbDown={!status.ok} />;
}
