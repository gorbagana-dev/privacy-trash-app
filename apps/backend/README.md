# Privacy Trash Backend

Backend service for Privacy Trash private GOR transfer indexing and proof support.

## Setup

Create a local `.env` from `.env.example`, then set `DATABASE_URL` to a
Postgres database. Run commands from the `privacy-trash-app` workspace root.

```sh
npm install
npm run db:migrate
npm run dev:backend
```

## Scripts

- `npm run dev:backend` - run the Hono server with `tsx watch`
- `npm run start -w @gorbagana/privacy-trash-backend` - run the built server
- `npm run build -w @gorbagana/privacy-trash-backend` - build `dist`
- `npm run typecheck -w @gorbagana/privacy-trash-backend` - run TypeScript checks
- `npm run test -w @gorbagana/privacy-trash-backend` - run Vitest
- `npm run db:generate` - generate Drizzle migrations
- `npm run db:migrate` - apply Drizzle migrations
- `npm run db:studio` - open Drizzle Studio

## Routes

- `GET /health`
- `GET /v1/config`
- `GET /v1/outputs/range`
- `GET /v1/outputs/check?encryptedOutput=...`
- `GET /v1/outputs/check/:encryptedOutput`
- `GET /v1/outputs/indices`
- `GET /v1/merkle/proof`
- `POST /v1/indexer/discover`
- `POST /v1/indexer/process`
- `GET /v1/pool/status`
- `GET /v1/pool/outputs`
- `GET /v1/pool/roots`
- `GET /v1/pool/merkle-path/:outputIndex`
- `GET /v1/pool/nullifiers/:nullifier`

The backend does not sign transactions, custody funds, or store user wallet
secrets.

## Indexer Discovery

`POST /v1/indexer/discover` fetches recent signatures for the Privacy Trash
program from Gorbagana RPC and inserts new rows into `indexer_signatures`.

Optional query:

```text
POST /v1/indexer/discover?limit=25
```

The route updates `indexer_state.high_watermark_signature` only after the DB
insert succeeds.

## Indexer Processing

`POST /v1/indexer/process` claims pending signatures, fetches finalized
transactions from Gorbagana RPC, parses native Privacy Trash `transact`
instructions, and writes parsed pool data.

Optional query:

```text
POST /v1/indexer/process?limit=5
```

The processor writes:

- `pool_outputs` from native `CommitmentData` program logs
- `pool_observed_roots` from proof roots used by native transact instructions
- `spent_nullifiers` from native transact instruction proof inputs

Rows are inserted idempotently, so reprocessing a transaction does not duplicate
pool state.

## Pool Reads

`GET /v1/pool/status` returns indexed pool counts and the latest output index.

`GET /v1/pool/outputs` returns native GOR output commitments and encrypted
outputs. Optional query:

```text
GET /v1/pool/outputs?limit=100&afterIndex=1
```

`GET /v1/pool/roots` returns proof roots observed in native transact
instructions. Optional query:

```text
GET /v1/pool/roots?limit=100
```

`GET /v1/pool/nullifiers/:nullifier` checks whether a 32-byte hex nullifier was
already spent.

`GET /v1/pool/merkle-path/:outputIndex` returns a prover-ready Merkle path for
an indexed output. `root`, `commitment`, and `pathElements` are decimal field
strings, matching the circuit input format. `commitmentHex` is included for
debugging against explorer/indexed event bytes.

## Client Reads

`GET /v1/outputs/range` returns encrypted outputs for wallet note scanning.
The range is `[start, end)` and cannot exceed 20,000 outputs.

```text
GET /v1/outputs/range?start=0&end=100
```

`GET /v1/outputs/check?encryptedOutput=...` checks whether a base64 encrypted
output is indexed. Prefer the query form because base64 can contain `/`.

```text
GET /v1/outputs/check?encryptedOutput=BASE64_OUTPUT
```

`GET /v1/outputs/check/:encryptedOutput` remains available for base64 values
that are safe in a path segment.

`GET /v1/outputs/indices` returns output indexes for decimal field commitments
or 32-byte hex commitments. Missing commitments return `-1`.

```text
GET /v1/outputs/indices?commitments=10,000000000000000000000000000000000000000000000000000000000000000a
```

`GET /v1/merkle/proof` returns the current tree root, next index, and Merkle
proofs for one or two decimal field commitments or 32-byte hex commitments.
Each proof has `found`; missing commitments return a zero proof with
`found: false`.

```text
GET /v1/merkle/proof?commitments=10
```
