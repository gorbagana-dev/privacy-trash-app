# Privacy Trash App

Monorepo for the Privacy Trash GOR-only private transfer app.

## Workspaces

- `apps/frontend`: Next.js frontend.
- `apps/backend`: Hono backend and indexer API.
- `packages/client`: transaction, note, proof, and browser workflow utilities.
- `packages/sdk`: generated and hand-curated TypeScript SDK for the on-chain program.

## Setup

```bash
npm install
```

Local environment files live in the app that uses them:

- `apps/backend/.env`
- `apps/frontend/.env.local`

Use the committed `.env.example` files as templates. Real `.env` files are ignored.

## Commands

```bash
npm run dev:frontend
npm run dev:backend
npm run typecheck
npm run test
npm run lint
npm run build
```

`npm run db:generate` and `npm run db:migrate` run the backend Drizzle commands.
