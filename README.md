# Dev-Team — plateforme d'agents IA

Plateforme web où un client décrit son besoin en français et reçoit une application
web construite et déployée par une équipe d'agents IA.

**Le parcours** : inscription → description du besoin → suivi en direct →
application livrée et en ligne.

---

## Architecture

```
Client (navigateur)
      │
      ▼
┌─────────────────────┐
│  Interface web      │  TanStack Start + React 19 + Tailwind 4
│  · espace client    │
│  · espace admin     │
└──────────┬──────────┘
           │ Supabase (auth, base, RLS, temps réel)
           ▼
┌─────────────────────┐
│  Pont (worker)      │  Python — interroge l'API protégée
│  scripts/bridge_*   │  crée les tâches, suit l'avancement
└──────────┬──────────┘
           │ Hermes (gateway + dispatcher kanban)
           ▼
┌─────────────────────┐
│  8 agents IA        │  architecte · dev-web · dev-mobile
│                     │  qa · secu · devops · maintenance
└──────────┬──────────┘
           │
           ▼
   Application livrée (Vercel)
```

## Stack

| Couche | Technologie |
|---|---|
| Frontend | TanStack Start (SSR), React 19, TypeScript, Tailwind CSS 4 |
| Composants | Radix UI (shadcn/ui) |
| Base de données | Supabase (PostgreSQL) + Row Level Security |
| Authentification | Supabase Auth (email/mot de passe, OAuth prêt) |
| Paiement | Paddle (appel direct à l'API) |
| Agents | Hermes Agent + tableau kanban |

## Démarrage

```bash
npm install
cp .env.example .env      # renseigner les clés Supabase
npm run dev               # http://localhost:8080
```

### Base de données

Le schéma complet est fourni dans `supabase/migrations/`, dans cet ordre :

| Fichier | Contenu |
|---|---|
| `000_schema_complet_autonome.sql` | 5 tables, enum, index, fonctions, triggers, RLS, 8 agents |
| `001_fix_grants.sql` | droits des rôles `service_role` et `authenticated` |
| `20251027000000_enforce_task_quota.sql` | quota de demandes par formule |

Coller ces fichiers dans le **SQL Editor** d'un projet Supabase neuf.

### Pont vers les agents

```bash
python scripts/bridge_worker.py          # boucle continue (15 s)
python scripts/bridge_worker.py --once   # un seul cycle
```

Le worker lit les demandes déposées, crée les tâches kanban côté Hermes,
suit leur avancement et remonte les statuts vers l'interface.

Sous Windows, `scripts/start-bridge.vbs` lance le worker silencieusement
(à placer dans le dossier Démarrage pour un lancement automatique).

## Modèle de données

| Table | Rôle |
|---|---|
| `profiles` | profil utilisateur (miroir de `auth.users`) |
| `user_roles` | rôle `admin` ou `client` |
| `tasks` | demandes clients + statut + résultat |
| `agents` | état des 8 agents |
| `subscriptions` | abonnements Paddle |

**Sécurité** : RLS active sur les 5 tables. Un client ne voit que ses propres
lignes ; un administrateur voit tout via `is_admin()` (`SECURITY DEFINER`).

**Quotas** : un trigger PostgreSQL bloque toute demande au-delà de la limite
de la formule (1 pour le plan gratuit, illimité avec abonnement actif).

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement (port 8080) |
| `npm run build` | build de production |
| `npm test` | tests Vitest |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Tests

```bash
npm test
```

Couvre la validation (UUID, troncature), les colonnes du tableau et le routage.

## Licence

MIT — voir [LICENSE](LICENSE).
