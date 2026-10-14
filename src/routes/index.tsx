import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/home-page";
import { ensureClinic } from "@/lib/mediturnos/fns";

export const Route = createFileRoute("/")({
  loader: async () => ensureClinic(),
  component: Home,
});

function Home() {
  const status = Route.useLoaderData();
  return <HomePage dbDown={!status.ok} />;
}
