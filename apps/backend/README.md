# Privacy Trash Backend

Hono API for Privacy Trash indexing and pool reads.

The backend reads Gorbagana program activity, stores indexed pool data in Postgres, and exposes the API used by the frontend.

## Setup

Run commands from the repository root:

```sh
npm install
cp apps/backend/.env.example apps/backend/.env
npm run db:migrate
npm run dev:backend
```

The API runs at `http://localhost:3002` by default.

## Environment

| Variable | Description |
| --- | --- |
| `NODE_ENV` | Runtime environment |
| `HOST` | Hostname to bind |
| `PORT` | Port to listen on |
| `LOG_LEVEL` | Logger level |
| `DATABASE_URL` | Postgres connection string |
| `DATABASE_POOL_MAX` | Maximum Postgres pool size |
| `DRIZZLE_LOG_QUERIES` | Enable Drizzle query logs |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins |
| `GORBAGANA_RPC_URL` | Gorbagana RPC URL |
| `PRIVACY_TRASH_PROGRAM_ADDRESS` | Deployed Privacy Trash program address |
| `EXPLORER_BASE_URL` | Gorbagana explorer URL |
| `INDEXER_AUTO_RUN` | Run the indexer loop on server start |
| `INDEXER_POLL_INTERVAL_MS` | Indexer loop interval |
| `INDEXER_DISCOVERY_LIMIT` | Signatures to discover per indexer pass |
| `INDEXER_PROCESSING_LIMIT` | Signatures to process per indexer pass |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev:backend` | Start the development server |
| `npm run start -w @gorbagana/privacy-trash-backend` | Start the built server |
| `npm run build -w @gorbagana/privacy-trash-backend` | Build the backend |
| `npm run typecheck -w @gorbagana/privacy-trash-backend` | Run TypeScript checks |
| `npm run test -w @gorbagana/privacy-trash-backend` | Run backend tests |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:studio` | Open Drizzle Studio |

## API Responses

Successful responses use this shape:

```json
{
  "success": true,
  "data": {}
}
```

Errors use this shape:

```json
{
  "success": false,
  "error": {
    "code": "bad_request",
    "message": "Invalid request."
  }
}
```

Common error codes are `bad_request`, `not_found`, `service_unavailable`, and `internal_error`.

## Routes

### Health

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Check API health |

### Config

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/v1/config` | Return public app configuration |

### Client Reads

| Method | Path | Query | Description |
| --- | --- | --- | --- |
| `GET` | `/v1/outputs/range` | `start`, `end` | List indexed encrypted outputs in `[start, end)` |
| `GET` | `/v1/outputs/check` | `encryptedOutput` | Check whether an encrypted output is indexed |
| `GET` | `/v1/outputs/check/:encryptedOutput` | none | Check an encrypted output from a path segment |
| `GET` | `/v1/outputs/indices` | `commitments` | Return output indexes for comma-separated commitments |
| `GET` | `/v1/merkle/proof` | `commitments` | Return Merkle proofs for one or two commitments |
| `GET` | `/v1/merkle/state` | none | Return the current indexed tree state |

`commitments` accepts decimal field elements or 32-byte hex commitments.

### Pool Reads

| Method | Path | Query | Description |
| --- | --- | --- | --- |
| `GET` | `/v1/pool/status` | none | Return indexed pool counts |
| `GET` | `/v1/pool/outputs` | `limit`, `afterIndex` | List indexed pool outputs |
| `GET` | `/v1/pool/roots` | `limit` | List observed Merkle roots |
| `GET` | `/v1/pool/merkle-path/:outputIndex` | none | Return a Merkle path for an output index |
| `GET` | `/v1/pool/nullifiers/:nullifier` | none | Check whether a nullifier is spent |

### Indexer

| Method | Path | Query | Description |
| --- | --- | --- | --- |
| `POST` | `/v1/indexer/discover` | `limit` | Discover recent program signatures |
| `POST` | `/v1/indexer/process` | `limit` | Process pending signatures |

## Query Limits

| Query | Limit |
| --- | --- |
| `/v1/outputs/range` | Up to 20,000 outputs |
| `/v1/outputs/indices` | Up to 100 commitments |
| `/v1/merkle/proof` | Up to 2 commitments |
| `/v1/pool/outputs` | Up to 500 outputs |
| `/v1/pool/roots` | Up to 500 roots |
| `/v1/indexer/discover` | Up to 1,000 signatures |
| `/v1/indexer/process` | Up to 100 signatures |
