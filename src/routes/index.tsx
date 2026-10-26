import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import logo from "@/assets/logo.png";
import hero from "@/assets/hero.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dev-Team — Votre équipe d'agents IA de développement" },
      {
        name: "description",
        content:
          "Décrivez votre application en français : une équipe de 8 agents IA la conçoit, la code, la teste, la sécurise et la déploie. Suivez tout en direct.",
      },
      { property: "og:title", content: "Dev-Team — Votre équipe d'agents IA de développement" },
      {
        property: "og:description",
        content:
          "Décrivez votre application en français : une équipe de 8 agents IA la conçoit, la code, la teste, la sécurise et la déploie.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const AGENTS = [
  {
    id: "default",
    role: "Orchestrateur + fullstack",
    desc: "Reçoit votre demande, la découpe et coordonne toute l'équipe.",
  },
  {
    id: "architecte",
    role: "Conception, découpage",
    desc: "Choisit l'architecture et transforme votre idée en plan d'exécution.",
  },
  {
    id: "dev-web",
    role: "API + frontend web",
    desc: "Construit les sites et applications web, du back-end aux écrans.",
  },
  {
    id: "dev-mobile",
    role: "Application Expo",
    desc: "Décline le produit en application mobile iOS et Android.",
  },
  {
    id: "qa",
    role: "Tests, rapports de bugs",
    desc: "Vérifie que tout marche avant que vous ne voyiez le résultat.",
  },
  {
    id: "secu",
    role: "Audit de sécurité",
    desc: "Inspecte chaque fonctionnalité pour protéger vos données.",
  },
  {
    id: "devops",
    role: "Déploiement",
    desc: "Met votre application en ligne et gère ses mises à jour.",
  },
  {
    id: "maintenance",
    role: "Corrections + santé",
    desc: "Surveille, répare et fait évoluer vos applications dans le temps.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Décrivez votre besoin",
    text: "Écrivez votre demande en français, comme à un collègue. Exemple : « Créer une app de réservation pour mon salon ».",
  },
  {
    n: "02",
    title: "L'équipe prend le relais",
    text: "L'orchestrateur transmet la demande aux agents : conception, code, tests, sécurité, déploiement.",
  },
  {
    n: "03",
    title: "Suivez tout en direct",
    text: "Le tableau des tâches et l'état des agents avancent en temps réel, du début à la mise en ligne.",
  },
];

const ADVANTAGES = [
  {
    title: "Une phrase suffit",
    text: "Pas de cahier des charges à écrire : décrivez votre idée en français, l'équipe fait le reste.",
  },
  {
    title: "Une équipe complète",
    text: "Conception, développement web et mobile, tests, sécurité et déploiement réunis au même endroit.",
  },
  {
    title: "Transparence totale",
    text: "Vous voyez chaque tâche avancer en direct, avec le résultat affiché à la fin.",
  },
  {
    title: "Espace client dédié",
    text: "Vos clients déposent leurs demandes et suivent l'avancement dans leur propre espace.",
  },
];

const PLANS = [
  {
    name: "Gratuit",
    price: "0 €",
    period: "pour toujours",
    desc: "Pour découvrir l'équipe et tester une première demande.",
    features: [
      "1 demande active à la fois",
      "Espace client avec suivi en direct",
      "Site ou application web",
      "Support par e-mail",
    ],
    cta: "Commencer gratuitement",
    highlight: false,
  },
  {
    name: "Pro",
    price: "25 €",
    period: "par mois",
    desc: "Pour les indépendants et petites entreprises qui avancent vite.",
    features: [
      "Demandes illimitées",
      "File prioritaire",
      "Web + application mobile",
      "Corrections et maintenance incluses",
      "Support prioritaire",
    ],
    cta: "Choisir Pro",
    highlight: true,
    priceId: "pro_monthly",
  },
  {
    name: "Business",
    price: "50 €",
    period: "par mois",
    desc: "Pour les agences et équipes qui gèrent plusieurs projets.",
    features: [
      "Tout Pro, et plus",
      "Plusieurs projets en parallèle",
      "Accès multi-utilisateurs",
      "Suivi renforcé sécurité et qualité",
      "Accompagnement dédié",
    ],
    cta: "Choisir Business",
    highlight: false,
    priceId: "business_monthly",
  },
  {
    name: "Entreprise",
    price: "Sur devis",
    period: "",
    desc: "Pour les grandes organisations aux besoins spécifiques.",
    features: [
      "Volume et équipe sur mesure",
      "Engagements de délais",
      "Sécurité et conformité avancées",
      "Contact direct avec l'équipe",
    ],
    cta: "Nous contacter",
    highlight: false,
  },
];

const FAQ = [
  {
    q: "Qui peut utiliser Dev-Team ?",
    a: "Deux espaces existent : l'espace admin, réservé au propriétaire de l'équipe, qui voit toutes les tâches et tous les clients, et l'espace client, où chaque client dépose ses demandes et suit ses propres tâches.",
  },
  {
    q: "Comment mes demandes sont-elles traitées ?",
    a: "Chaque demande est enregistrée puis transmise à l'orchestrateur, qui la distribue aux agents de l'unité dev. Le tableau des tâches se met à jour en direct à chaque étape.",
  },
  {
    q: "Que se passe-t-il après la mise en ligne ?",
    a: "L'agent de maintenance surveille vos applications, corrige les bugs signalés et assure leur suivi dans le temps.",
  },
  {
    q: "Faut-il des connaissances techniques ?",
    a: "Non. Tout se fait en français, depuis votre espace : vous décrivez, l'équipe construit, vous suivez.",
  },
];

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">{kicker}</p>
      <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{title}</h2>
    </div>
  );
}

function PlanCta({ plan }: { plan: (typeof PLANS)[number] & { priceId?: string } }) {
  const { openCheckout, loading } = usePaddleCheckout();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    if (!plan.priceId) {
      navigate({ to: "/auth" });
      return;
    }
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    try {
      await openCheckout({
        priceId: plan.priceId,
        quantity: 1,
        ...(user.email ? { customerEmail: user.email } : {}),
        customData: { userId: user.id },
        successUrl: `${window.location.origin}/checkout/success`,
      });
    } catch {
      setError("Le paiement n'a pas pu s'ouvrir. Réessayez dans un instant.");
    }
  };

  return (
    <div className="mt-6">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`w-full rounded-md px-4 py-2 text-center text-sm font-semibold disabled:opacity-60 ${
          plan.highlight
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border border-border hover:border-primary"
        }`}
      >
        {loading ? "Ouverture…" : plan.cta}
      </button>
      {error && <p className="mt-2 text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="Dev-Team" width={976} height={189} className="h-8 w-auto" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#fonctionnement" className="hover:text-primary">
              Fonctionnement
            </a>
            <a href="#agents" className="hover:text-primary">
              Agents
            </a>
            <a href="#avantages" className="hover:text-primary">
              Avantages
            </a>
            <a href="#tarifs" className="hover:text-primary">
              Tarifs
            </a>
            <a href="#faq" className="hover:text-primary">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary">
              Se connecter
            </Link>
            <Link
              to="/auth"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Commencer
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            SaaS de création de sites et d'applications
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
            Votre application, construite par une équipe d'agents IA.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Décrivez votre besoin en français. 8 agents conçoivent, codent, testent, sécurisent et
            déploient — et vous suivez chaque étape en direct.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth"
              className="rounded-md bg-primary px-8 py-3 text-base font-semibold text-primary-foreground hover:opacity-90"
            >
              Créer mon compte
            </Link>
            <a
              href="#fonctionnement"
              className="rounded-md border border-border px-8 py-3 text-base font-semibold hover:border-primary"
            >
              Voir comment ça marche
            </a>
          </div>
          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-4 font-mono text-sm">
            {[
              ["8", "agents spécialisés"],
              ["24/7", "équipe disponible"],
              ["FR", "100 % en français"],
            ].map(([big, small]) => (
              <div key={small} className="rounded-lg border border-border bg-card/50 p-4">
                <div className="text-2xl font-bold text-primary">{big}</div>
                <div className="mt-1 text-xs text-muted-foreground">{small}</div>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-14 max-w-4xl">
            <img
              src={hero}
              alt="Les 8 agents IA de Dev-Team construisent une application ensemble"
              width={1536}
              height={1024}
              className="w-full rounded-xl border border-border shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* Fonctionnement */}
      <section id="fonctionnement" className="mx-auto max-w-6xl px-6 py-20">
        <SectionTitle
          kicker="Fonctionnement"
          title="De l'idée à la mise en ligne, en trois étapes"
        />
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-lg border border-border bg-card p-6">
              <div className="font-mono text-sm text-primary">{s.n}</div>
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="border-y border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionTitle
            kicker="L'équipe"
            title="8 agents, un seul objectif : livrer votre application"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {AGENTS.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-card p-5">
                <div className="font-mono text-sm text-primary">@{a.id}</div>
                <div className="mt-2 text-sm font-semibold">{a.role}</div>
                <p className="mt-2 text-xs text-muted-foreground">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Avantages */}
      <section id="avantages" className="mx-auto max-w-6xl px-6 py-20">
        <SectionTitle kicker="Avantages" title="Pourquoi les clients choisissent Dev-Team" />
        <div className="grid gap-4 sm:grid-cols-2">
          {ADVANTAGES.map((a) => (
            <div key={a.title} className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-lg font-semibold">{a.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tarifs */}
      <section id="tarifs" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionTitle kicker="Tarifs" title="Une formule pour chaque ambition" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`flex flex-col rounded-lg border p-6 ${
                  p.highlight ? "border-primary bg-card shadow-lg" : "border-border bg-card"
                }`}
              >
                {p.highlight && (
                  <span className="mb-3 w-fit rounded-full bg-primary px-3 py-1 font-mono text-xs text-primary-foreground">
                    Le plus choisi
                  </span>
                )}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-primary">{p.price}</span>
                  {p.period && <span className="text-xs text-muted-foreground">{p.period}</span>}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{p.desc}</p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-0.5 font-mono text-primary">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <PlanCta plan={p} />
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-xs text-muted-foreground">
            Tous les prix sont hors taxes. Vous pouvez changer de formule ou annuler à tout moment.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border bg-card/30">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <SectionTitle kicker="FAQ" title="Questions fréquentes" />
          <div className="space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-lg border border-border bg-card p-5">
                <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                  <span className="mr-2 font-mono text-primary group-open:hidden">+</span>
                  <span className="mr-2 hidden font-mono text-primary group-open:inline">–</span>
                  {f.q}
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Prêt à voir votre idée prendre vie ?</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Créez votre compte, déposez votre première demande et regardez l'équipe travailler en
            direct.
          </p>
          <Link
            to="/auth"
            className="mt-8 inline-block rounded-md bg-primary px-8 py-3 text-base font-semibold text-primary-foreground hover:opacity-90"
          >
            Commencer maintenant
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <img
            src={logo}
            alt="Dev-Team"
            width={976}
            height={189}
            loading="lazy"
            className="h-7 w-auto"
          />
          <div className="flex items-center gap-6">
            <Link to="/auth" className="hover:text-primary">
              Espace client
            </Link>
            <Link to="/auth" className="hover:text-primary">
              Espace admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
