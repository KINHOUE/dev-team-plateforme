import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/Dashboard";

export const Route = createFileRoute("/_authenticated/espace")({
  head: () => ({
    meta: [
      { title: "Espace client — Dev-Team" },
      { name: "description", content: "Déposez vos demandes et suivez leur avancement." },
      { property: "og:title", content: "Espace client — Dev-Team" },
      { property: "og:description", content: "Déposez vos demandes et suivez leur avancement." },
    ],
  }),
  component: () => <Dashboard mode="client" />,
});
