import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { COLUMNS } from "@/lib/team";
import { getPaddleEnvironment } from "@/lib/paddle";

type Task = Tables<"tasks">;
type Agent = Tables<"agents">;
type Subscription = Tables<"subscriptions">;

const PLAN_NAMES: Record<string, string> = {
  pro_monthly: "Pro",
  business_monthly: "Business",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  trialing: "Essai",
  past_due: "Paiement en retard",
  paused: "En pause",
  canceled: "Annulé",
};

const dot: Record<string, string> = {
  actif: "bg-success",
  "en attente": "bg-warning",
  "hors ligne": "bg-muted-foreground",
};

export function Dashboard({ mode }: { mode: "admin" | "client" }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const load = async () => {
    const [t, a] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("agents").select("*").order("id"),
    ]);
    setTasks(t.data ?? []);
    setAgents(a.data ?? []);
    if (mode === "admin") {
      const p = await supabase.from("profiles").select("id, display_name");
      setNames(Object.fromEntries((p.data ?? []).map((r) => [r.id, r.display_name ?? "?"])));
      const s = await supabase
        .from("subscriptions")
        .select("*")
        .eq("environment", getPaddleEnvironment())
        .order("created_at", { ascending: false });
      setSubs(s.data ?? []);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`dash-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "agents" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    // Session expirée : on renvoie vers la connexion au lieu de planter sur u.user!
    if (!u.user) {
      setBusy(false);
      toast.error("Votre session a expiré, reconnectez-vous.");
      navigate({ to: "/auth", replace: true });
      return;
    }
    const { error } = await supabase.from("tasks").insert({
      client_id: u.user.id,
      title: value.length > 80 ? value.slice(0, 77) + "…" : value,
      description: value.slice(0, 5000),
    });
    setBusy(false);
    if (error) {
      // Le quota est appliqué par un trigger PostgreSQL : message explicite si atteint
      if (error.code === "23514" || /Limite de demandes actives/i.test(error.message)) {
        toast.error(
          "Vous avez atteint le nombre de demandes actives de votre formule. Terminez une demande ou passez à une formule supérieure.",
        );
        return;
      }
      toast.error("La demande n'a pas pu être envoyée.");
      return;
    }
    setText("");
    toast.success("Demande envoyée à l'équipe.");
    load();
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link to="/" className="font-mono text-sm tracking-widest text-primary">
          DEV-TEAM // UNITÉ DEV
        </Link>
        <div className="flex items-center gap-3">
          <span className="rounded border border-border px-3 py-1 font-mono text-xs uppercase text-muted-foreground">
            {mode === "admin" ? "Espace admin" : "Espace client"}
          </span>
          <button onClick={signOut} className="text-xs text-muted-foreground hover:text-primary">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-3 text-lg font-semibold">Nouvelle demande</h2>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Décrivez votre besoin en français… ex : « Créer une app de réservation pour mon salon »"
              className="h-28 w-full resize-none rounded-md border border-input bg-background p-3 text-sm outline-none focus:border-primary"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Transmise à l'orchestrateur « default »
              </span>
              <button
                disabled={busy}
                onClick={send}
                className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Envoyer
              </button>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Tableau des tâches</h2>
            <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
              {COLUMNS.map((col) => {
                const items = tasks.filter((t) => t.status === col);
                return (
                  <div
                    key={col}
                    className="min-w-[180px] rounded-lg border border-border bg-card/50 p-3"
                  >
                    <div className="mb-3 flex justify-between font-mono text-xs uppercase text-muted-foreground">
                      <span>{col}</span>
                      <span>{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((t) => (
                        <div key={t.id} className="rounded-md border border-border bg-card p-3">
                          <div className="text-sm font-medium">{t.title}</div>
                          <div className="mt-2 text-xs text-muted-foreground">@{t.agent}</div>
                          {mode === "admin" && (
                            <div className="text-xs text-muted-foreground">
                              {names[t.client_id] ?? ""}
                            </div>
                          )}
                          {t.result && (
                            <div className="mt-2 border-t border-border pt-2 text-xs">
                              {t.result}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {tasks.length === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">Aucune demande pour l'instant.</p>
            )}
          </section>

          {mode === "admin" && (
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 text-lg font-semibold">Abonnements</h2>
              {subs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun abonnement pour l'instant.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left font-mono text-xs uppercase text-muted-foreground">
                      <th className="pb-2 pr-4">Client</th>
                      <th className="pb-2 pr-4">Formule</th>
                      <th className="pb-2 pr-4">Début</th>
                      <th className="pb-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-4">{names[s.user_id] ?? "?"}</td>
                        <td className="py-2 pr-4 font-medium text-primary">
                          {PLAN_NAMES[s.price_id] ?? s.price_id}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {new Date(
                            s.current_period_start ?? s.created_at ?? "",
                          ).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {STATUS_LABELS[s.status] ?? s.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>

        <aside className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold">État des agents</h2>
          <ul className="space-y-3">
            {agents.map((a) => (
              <li key={a.id} className="border-b border-border pb-3 last:border-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${dot[a.status] ?? "bg-muted-foreground"}`}
                  />
                  <span className="font-mono text-sm">{a.id}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{a.status}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{a.role}</div>
                {mode === "admin" && a.current_task && (
                  <div className="mt-1 text-xs text-primary">→ {a.current_task}</div>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </div>
  );
}
