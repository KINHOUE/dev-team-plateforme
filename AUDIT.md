# Audit du projet LOVEBLE / Dev-Team

Date : 25 octobre 2026
Périmètre : `C:\Users\PC\LOVEBLE` — intégralité du code source
Méthode : lecture de tous les fichiers critiques + exécution réelle de `tsc`, `eslint`, `vitest`, `vite build`

---

## 1. Résumé

| Indicateur                 | Valeur mesurée                                                   |
| -------------------------- | ---------------------------------------------------------------- |
| Fichiers source            | **81** (`.ts` / `.tsx`)                                          |
| Lignes de code             | **7 145**                                                        |
| Dépendances de production  | **55**                                                           |
| Tables Supabase            | 5 (`profiles`, `user_roles`, `tasks`, `agents`, `subscriptions`) |
| Tests                      | **1** (routage uniquement)                                       |
| Typecheck (`tsc --noEmit`) | ❌ **5 erreurs**                                                 |
| Lint (`eslint`)            | ⚠️ **395 problèmes** (389 erreurs)                               |
| Tests (`vitest`)           | ✅ 1/1                                                           |
| Build (`vite build`)       | ❌ bloqué (fichier verrouillé)                                   |

**Verdict** : le projet est **bien structuré et sérieusement pensé sur la sécurité des paiements**. Mais il présente un **trou économique majeur** : la limite d'abonnement annoncée n'est appliquée nulle part. Un compte gratuit peut utiliser le service sans limite.

---

## 2. Architecture

```
src/
├── routes/
│   ├── index.tsx                    landing (391 l., plans, FAQ, agents)
│   ├── auth.tsx                     connexion / inscription / Google
│   ├── _authenticated/
│   │   ├── route.tsx                garde d'auth (redirect si non connecté)
│   │   ├── espace.tsx               espace client
│   │   └── admin.tsx                espace admin (vérif de rôle)
│   ├── checkout/success.tsx         retour de paiement
│   └── api/public/
│       ├── hermes.ts                pont Hermes ↔ base (token Bearer)
│       └── payments/webhook.ts      webhook Paddle (signature vérifiée)
├── components/
│   ├── Dashboard.tsx                tableau de tâches + état des agents
│   └── ui/                          shadcn/ui (Radix), ~40 composants
├── integrations/supabase/
│   ├── client.ts                    client navigateur (clé publique)
│   ├── client.server.ts             service role (bypass RLS) — serveur only
│   └── types.ts                     types générés
├── lib/
│   ├── paddle.server.ts             SDK Paddle + vérification de signature
│   ├── team.ts                      rôles + colonnes du board
│   └── utils.ts
└── hooks/usePaddleCheckout.ts       ouverture du checkout
```

**Stack** : TanStack Start (SSR) + React 19 + TypeScript + Tailwind 4 + Supabase (auth, DB, realtime, RLS) + Paddle (via passerelle Lovable).

---

## 3. Ce qui est bien fait

### Paiement — le point le plus solide du projet

`src/routes/api/public/payments/webhook.ts` :

- vérification de **signature** Paddle avant tout traitement
- essai `sandbox` puis `live` (les deux environnements cohabitent proprement)
- **idempotence** : `upsert` sur `paddle_subscription_id`
- **liste blanche** des prix (`pro_monthly`, `business_monthly`) — un prix inconnu est rejeté
- validation du `userId` comme **UUID** avant écriture
- détection de conflit : une souscription existante liée à un autre utilisateur est refusée
- service role utilisé **uniquement côté serveur**

### Base de données

`supabase/migrations/..._enable_rls_policies.sql` :

- **RLS activé sur les 5 tables**
- `is_admin()` en `SECURITY DEFINER` avec `search_path` figé (bonne pratique)
- `tasks` : un client ne voit et ne modifie que ses propres lignes
- `subscriptions` : écriture réservée au `service_role` (le webhook seul écrit)
- `user_roles` : seul un admin peut gérer les rôles

### Autres

- Service role isolé dans `client.server.ts`, avec un Proxy qui n'initialise le client qu'à la demande, et un commentaire d'avertissement explicite
- Messages d'erreur génériques côté interface (pas de fuite d'information)
- Emails de confirmation d'inscription configurés
- Page de succès en `noindex`

---

## 4. Problèmes — par sévérité

### 🔴 CRITIQUE

#### C-1 · Aucune limite d'abonnement appliquée

**Fichiers** : `src/components/Dashboard.tsx:74-89`, `supabase/migrations/...sql`

La landing page annonce pour le plan gratuit : **« 1 demande active à la fois »**.
La fonction `has_active_subscription()` **existe dans les types générés** (`types.ts:166`) mais n'est **appelée nulle part** dans le code.

```ts
// Dashboard.tsx — send()
const { error } = await supabase.from("tasks").insert({ client_id: u.user!.id, ... });
```

La politique RLS autorise l'insertion à tout utilisateur authentifié. **Un compte gratuit peut donc créer un nombre illimité de tâches.**

**Impact** : perte de revenu directe. Le produit est utilisable gratuitement sans limite.
**Correctif** : refuser l'insertion si le nombre de tâches actives dépasse le quota du plan, côté serveur (trigger PostgreSQL ou server function), pas seulement dans l'interface.

#### C-2 · Le pont Hermes expose les tâches de tous les clients

**Fichier** : `src/routes/api/public/hermes.ts:20-23`

```ts
.from("tasks").select("id, title, description, created_at").eq("status", "À faire")
```

Aucun filtre par client : le pont renvoie **toutes** les demandes en attente, tous clients confondus.

**Impact** : si le token `HERMES_BRIDGE_TOKEN` fuite, toutes les demandes de tous les clients sont exposées.
**Correctif** : filtrer par client, ou assumer explicitement le rôle admin et journaliser les accès.

#### C-3 · Google OAuth incomplet (le bug signalé)

**Config Supabase, pas le code.** Le provider est activé (`google: true`) mais sans Client ID ni Secret → `missing OAuth secret`.
**Correctif** : renseigner les identifiants Google dans le dashboard Supabase (voir la procédure déjà transmise).

---

### 🟠 MAJEUR

#### M-1 · 5 erreurs TypeScript

**Fichier** : `src/routes/api/public/payments/webhook.ts:113-124`

```
TS4111: Property 'status' comes from an index signature,
        so it must be accessed with ['status']
```

Sur un objet `Record<string, unknown>`, `update.status` est refusé par TypeScript.
**Le build passe quand même** (Vite n'exécute pas `tsc`), donc l'erreur est silencieuse — mais `tsc --noEmit` échoue, ce qui casserait une CI sérieuse.
**Correctif** : `update["status"] = ...` (5 occurrences).

#### M-2 · Contrôle d'accès admin uniquement côté client

**Fichier** : `src/routes/_authenticated/admin.tsx:6-8`

```ts
beforeLoad: async () => {
  if ((await getRole()) !== "admin") throw redirect({ to: "/espace" });
};
```

Ce contrôle s'exécute dans le navigateur. Il est **contournable** (état modifié, requête directe).
Les données restent protégées par RLS — donc pas de fuite réelle — mais la défense est en un seul point.
**Correctif** : vérifier le rôle côté serveur pour les données d'administration.

#### M-3 · `useState` utilisé comme effet de bord

**Fichier** : `src/routes/auth.tsx:86-97`

```ts
useState(() => {
  supabase.auth.getUser().then(({ data }) => data.user && goHome());
});
```

Ce code s'exécute **pendant le rendu**, est rappelé deux fois en React StrictMode, et lance une navigation asynchrone hors du cycle de vie normal.
**Correctif** : `useEffect(() => { ... }, [])`.

#### M-4 · Sessions non vérifiées avant écriture

**Fichier** : `src/components/Dashboard.tsx:78-80`

```ts
const { data: u } = await supabase.auth.getUser();
const { error } = await supabase.from("tasks").insert({ client_id: u.user!.id, ... });
```

`u.user!` : si la session a expiré, `u.user` est `null` → `TypeError` non géré, l'utilisateur voit un écran cassé au lieu d'être redirigé.
**Correctif** : tester `if (!u.user) { redirect } ` avant l'insertion.

#### M-5 · Quasi-absence de tests

Un seul test (`src/test/app-routing.test.tsx`) qui vérifie qu'une route existe.
**Aucun test** sur : l'authentification, le webhook Paddle, les politiques RLS, le pont Hermes, le contrôle de rôle.
**Impact** : toute régression sur le paiement ou la sécurité passe inaperçue.

---

### 🟡 MINEUR

| #   | Problème                                                                                                                                                        | Fichier                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| m-1 | **382 erreurs prettier** — le code n'est pas formaté selon la config du projet (382 auto-corrigeables)                                                          | 23 fichiers                      |
| m-2 | 7 `any` explicites                                                                                                                                              | `webhook.ts`, `client.server.ts` |
| m-3 | 6 avertissements `react-refresh/only-export-components`                                                                                                         | `components/ui/`                 |
| m-4 | `description` non bornée (seul `title` est tronqué à 80 caractères)                                                                                             | `Dashboard.tsx:81-82`            |
| m-5 | `console.error` actifs en production (bruit + fuite de contexte dans les logs)                                                                                  | `webhook.ts`, `hermes.ts`        |
| m-6 | Abonnement Realtime à `subscriptions` même en mode client (inutile, RLS filtre)                                                                                 | `Dashboard.tsx:68`               |
| m-7 | `Math.random()` comme nom de canal Realtime (devrait être stable)                                                                                               | `Dashboard.tsx:65`               |
| m-8 | Comparaison de token par `===` (théoriquement sensible au timing)                                                                                               | `hermes.ts:9`                    |
| m-9 | Dépendance forte à l'écosystème Lovable (`connector-gateway.lovable.dev`, `@lovable.dev/cloud-auth-js`) — sortir de Lovable demanderait de réécrire le paiement | `paddle.server.ts`               |

---

## 5. Environnement — le build échoue

```
EBUSY: resource busy or locked, rmdir 'C:\Users\PC\LOVEBLE\.output\server'
```

Un processus détient ce dossier (deux processus `node`/`npx` sont actifs, dont un `wrangler`).
**Ce n'est pas un défaut du code** : le dossier est verrouillé par un serveur resté ouvert.
**Correctif** : fermer le serveur de développement, puis `npm run build`.

---

## 6. Plan de correction priorisé

| Priorité | Action                                                            | Effort |
| -------- | ----------------------------------------------------------------- | ------ |
| **1**    | Appliquer la limite d'abonnement (trigger SQL ou server function) | 2 h    |
| **2**    | Corriger les 5 erreurs TypeScript                                 | 10 min |
| **3**    | Configurer Google OAuth (dashboard Supabase)                      | 10 min |
| **4**    | Filtrer le pont Hermes par client                                 | 30 min |
| **5**    | Remplacer `useState`-effet par `useEffect`                        | 10 min |
| **6**    | Vérifier `u.user` avant toute écriture                            | 10 min |
| **7**    | Vérifier le rôle admin côté serveur                               | 1 h    |
| **8**    | `npm run format` (382 corrections automatiques)                   | 2 min  |
| **9**    | Tests : webhook, auth, RLS, quotas                                | 4 h    |
| **10**   | Fermer le serveur résiduel et valider le build                    | 2 min  |

---

## 7. Correctifs appliqués le 25/10/2026

### État final mesuré

| Contrôle | Avant | Après |
|---|---|---|
| `tsc --noEmit` | 5 erreurs | **0** |
| `eslint` | 389 erreurs, 6 warnings | **0 erreur**, 6 warnings |
| `vitest` | 1 test | **10 tests**, tous verts |
| `vite build` | bloqué (EBUSY) | **succès** |

### Fichiers créés

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20251027000000_enforce_task_quota.sql` | **quotas par formule** (corrige C-1) |
| `src/lib/validation.ts` | `isUuid`, `toTitle` — testables hors routeur |
| `src/test/validation.test.ts` | 9 tests (UUID, troncature, colonnes du board) |

### Fichiers modifiés

| Fichier | Correctif |
|---|---|
| `src/components/Dashboard.tsx` | session vérifiée avant écriture, message clair en cas de quota atteint, `description` bornée à 5 000 caractères |
| `src/routes/auth.tsx` | `useState`-effet remplacé par `useEffect` |
| `src/routes/api/public/hermes.ts` | comparaison de token à temps constant, filtre `?client_id=`, limite 100 résultats |
| `src/routes/api/public/payments/webhook.ts` | 5 erreurs TS corrigées, typage complet (fini les `any`), gardes sur `id` et `customerId` |
| `src/lib/paddle.ts` | `window.Paddle` typé au lieu de `any` |
| 23 fichiers | reformatés par prettier (382 corrections) |

### Comment le quota fonctionne

Le trigger PostgreSQL `tasks_quota_check`, exécuté **avant chaque insertion** :

| Formule | Demandes actives autorisées |
|---|---|
| Gratuit (aucun abonnement actif) | **1** |
| Pro / Business (abonnement actif) | illimité en pratique |

Une demande est « active » tant que son statut n'est pas **Terminé**.
Le contournement est impossible : la règle est dans la base, pas dans l'interface.

### ⚠️ Action restante — à faire par toi

La migration **n'est pas encore appliquée** sur ton projet Supabase. Sans elle, le quota n'existe pas en base.

1. Ouvre **https://supabase.com/dashboard/project/qzrrgfwssegvliuszbae/sql/new**
2. Colle l'intégralité de `supabase/migrations/20251027000000_enforce_task_quota.sql`
3. **Run**

Puis vérifie : un compte sans abonnement doit être bloqué à la 2ᵉ demande active.

### Ce qui n'a pas été corrigé (et pourquoi)

**M-2 · Contrôle admin côté client** — reclassé en mineur après vérification.
La RLS protège réellement : un non-admin qui force `/admin` ne récupère que **son propre** profil et **ses propres** abonnements (`USING (auth.uid() = id)`). Le `beforeLoad` n'est qu'un confort d'affichage. Il n'y a pas de fuite.

**C-3 · Google OAuth** — dépend de ton compte Google et du dashboard Supabase, pas du code (procédure déjà transmise).

**Tests d'intégration** (webhook réel, RLS) — nécessitent une base Supabase de test. Non réalisables sans elle.

---

## 8. Conclusion


Le socle est **bon** : architecture claire, paiement correctement sécurisé, RLS complet, service role bien isolé. Ce n'est pas un projet fragile.

Le problème n'est pas technique mais **commercial** : le produit promet une limite qu'il n'applique pas. Tant que C-1 n'est pas corrigé, tout le monde utilise Dev-Team gratuitement.

Les correctifs 1 à 8 représentent **environ 4 heures** et rendent le projet exploitable en production.
