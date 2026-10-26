import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getRole } from "@/lib/team";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connexion — Dev-Team" },
      { name: "description", content: "Connectez-vous à votre espace Dev-Team." },
      { property: "og:title", content: "Connexion — Dev-Team" },
      { property: "og:description", content: "Connectez-vous à votre espace Dev-Team." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const goHome = async () => {
    const role = await getRole();
    navigate({ to: role === "admin" ? "/admin" : "/espace", replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "up") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + "/auth",
          data: { display_name: name },
        },
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Compte créé ! Vérifiez votre e-mail pour le confirmer.");
      setMode("in");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        toast.error("E-mail ou mot de passe incorrect.");
        return;
      }
      await goHome();
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/auth",
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) {
        toast.error("Connexion Google impossible.");
        console.error(error);
        setBusy(false);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast.error("Connexion Google impossible.");
      setBusy(false);
    } catch (e) {
      console.error(e);
      toast.error("Connexion Google impossible.");
      setBusy(false);
    }
  };

  // déjà connecté (retour Google ou confirmation e-mail)
  useEffect(() => {
    // Nettoie les erreurs OAuth laissées dans l'URL (Google renvoie ?error=...)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("error") || url.hash.includes("error")) {
        url.search = "";
        url.hash = "";
        window.history.replaceState({}, document.title, url.toString());
      }
    }
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data.user) goHome();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const input =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
        <p className="font-mono text-xs tracking-widest text-primary">DEV-TEAM</p>
        <h1 className="mt-2 text-2xl font-bold">
          {mode === "in" ? "Connexion" : "Créer un compte"}
        </h1>
        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "up" && (
            <input
              className={input}
              placeholder="Nom ou entreprise"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            className={input}
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className={input}
            type="password"
            placeholder="Mot de passe"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            disabled={busy}
            className="w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {mode === "in" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>
        <button
          onClick={google}
          className="mt-3 w-full rounded-md border border-border py-2 text-sm hover:border-primary"
        >
          Continuer avec Google
        </button>
        <button
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="mt-4 w-full text-xs text-muted-foreground hover:text-primary"
        >
          {mode === "in" ? "Pas de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}
