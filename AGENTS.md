# Dev-Team — interface web

Application TanStack Start (React + TypeScript + Tailwind) servant d'interface
a l'equipe d'agents Dev-Team.

## Stack

- **TanStack Start** (SSR) + React 19 + TypeScript
- **Supabase** (auth, base de donnees, RLS)
- **Paddle** (paiements, appel direct a l'API — plus de passerelle intermediaire)
- **Tailwind CSS 4** + composants Radix (shadcn/ui)

## Demarrage

```bash
npm install
cp .env.example .env    # renseigner les cles Supabase
npm run dev             # http://localhost:8080
```

## Variables d'environnement

| Variable | Portee | Role |
|---|---|---|
| `VITE_SUPABASE_URL` | client | URL du projet Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client | cle publique (exposee au navigateur) |
| `SUPABASE_URL` | serveur | meme URL |
| `SUPABASE_SERVICE_ROLE_KEY` | serveur | cle secrete, contourne la RLS |
| `PADDLE_SANDBOX_API_KEY` | serveur | Paddle sandbox |
| `PAYMENTS_SANDBOX_WEBHOOK_SECRET` | serveur | signature des webhooks |

Tout ce qui commence par `VITE_` est **public**. Les secrets restent cote serveur.

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de developpement (port 8080) |
| `npm run build` | build de production |
| `npm test` | tests Vitest |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Base de donnees

Le schema complet (5 tables, RLS, triggers, quotas) se trouve dans
`supabase/migrations/000_schema_complet_autonome.sql`, avec les droits
d'acces dans `001_fix_grants.sql`.

Pour l'installer sur un projet Supabase neuf : coller ces fichiers dans le
SQL Editor, dans l'ordre.

## Quotas

Le plan gratuit autorise **1 demande active**. Au-dela, un trigger PostgreSQL
refuse l'insertion avec un message explicite. Un abonnement actif leve la limite.
