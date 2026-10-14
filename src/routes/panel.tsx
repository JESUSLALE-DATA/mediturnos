import { createFileRoute } from "@tanstack/react-router";
import { PanelApp } from "@/components/panel-app";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/panel")({
  component: PanelRoute,
});

function PanelRoute() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-foam text-muted">
        <p>Comprobando la sesión…</p>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn to="/login" />;
  return <PanelApp />;
}
