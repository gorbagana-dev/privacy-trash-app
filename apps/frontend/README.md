# Privacy Trash Frontend

Next.js frontend for Privacy Trash.

## Setup

Run commands from the repository root:

```sh
npm install
cp apps/frontend/.env.example apps/frontend/.env.local
npm run dev:frontend
```

The app runs at `http://localhost:3000` by default.

## Environment

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_GORBAGANA_RPC_URL` | Gorbagana RPC URL |
| `NEXT_PUBLIC_PRIVACY_TRASH_API_URL` | Privacy Trash backend URL |
| `NEXT_PUBLIC_PRIVACY_TRASH_PROGRAM_ADDRESS` | Deployed Privacy Trash program address |
| `NEXT_PUBLIC_PRIVACY_TRASH_ALT_ADDRESS` | Optional address lookup table |
| `NEXT_PUBLIC_HASHER_WASM_BASE_PATH` | Public path for hasher WASM files |
| `NEXT_PUBLIC_SITE_URL` | Public site URL |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev:frontend` | Start the Next.js dev server |
| `npm run build -w @gorbagana/privacy-trash-frontend` | Build the frontend |
| `npm run typecheck -w @gorbagana/privacy-trash-frontend` | Run TypeScript checks |
| `npm run test -w @gorbagana/privacy-trash-frontend` | Run frontend tests |
| `npm run lint -w @gorbagana/privacy-trash-frontend` | Run ESLint |

## Public Assets

The frontend serves proof and hashing assets from `public/`.

| Path | Description |
| --- | --- |
| `public/circuit2` | Groth16 circuit files |
| `public/vendor/lightprotocol/hasher.rs` | Poseidon hasher WASM files |
