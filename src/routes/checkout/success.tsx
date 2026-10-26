import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/checkout/success")({
  head: () => ({
    meta: [
      { title: "Paiement confirmé — Dev-Team" },
      { name: "description", content: "Votre abonnement Dev-Team est confirmé." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutSuccess,
});

function CheckoutSuccess() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 font-mono text-2xl text-primary">
          ✓
        </div>
        <h1 className="mt-6 text-2xl font-bold text-foreground">Merci, c'est confirmé !</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Votre abonnement est en cours d'activation. Il apparaîtra dans votre espace client dans
          quelques instants.
        </p>
        <Link
          to="/espace"
          className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Aller à mon espace
        </Link>
      </div>
    </div>
  );
}
