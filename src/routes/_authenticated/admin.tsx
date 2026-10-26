import { createFileRoute, redirect } from "@tanstack/react-router";
import { Dashboard } from "@/components/Dashboard";
import { getRole } from "@/lib/team";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    if ((await getRole()) !== "admin") throw redirect({ to: "/espace" });
  },
  head: () => ({
    meta: [
      { title: "Espace admin — Dev-Team" },
      {
        name: "description",
        content: "Supervisez toutes les demandes clients et l'état des agents.",
      },
      { property: "og:title", content: "Espace admin — Dev-Team" },
      {
        property: "og:description",
        content: "Supervisez toutes les demandes clients et l'état des agents.",
      },
    ],
  }),
  component: () => <Dashboard mode="admin" />,
});
