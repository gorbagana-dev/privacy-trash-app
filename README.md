# Privacy Trash App

Privacy Trash is a GOR-only private transfer app for Gorbagana.

This repository contains the frontend, backend, client package, and contract SDK used by the app.

## Workspaces

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/frontend` | `@gorbagana/privacy-trash-frontend` | Next.js app |
| `apps/backend` | `@gorbagana/privacy-trash-backend` | Hono API, indexer, and relayer |
| `packages/client` | `@gorbagana/privacy-trash-client` | Browser and transaction workflow helpers |
| `packages/sdk` | `@gorbagana/privacy-trash-sdk` | TypeScript SDK for the on-chain program |

## Requirements

- Node.js 24 or newer
- npm 11 or newer
- Postgres
- Gorbagana RPC access

## Setup

Install dependencies from the repository root:

```sh
npm install
```

Create local environment files:

```sh
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Set `DATABASE_URL` in `apps/backend/.env`, then run migrations:

```sh
npm run db:migrate
```

Start the backend and frontend:

```sh
npm run dev:backend
npm run dev:frontend
```

## Commands

| Command | Description |
| --- | --- |
| `npm run dev:frontend` | Start the frontend |
| `npm run dev:backend` | Start the backend |
| `npm run typecheck` | Run TypeScript checks |
| `npm run test` | Run tests |
| `npm run lint` | Run linting |
| `npm run build` | Build all workspaces |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run generate:sdk` | Regenerate the contract SDK |

## Environment Files

Commit `.env.example` files only. Local `.env` files are ignored by Git.
