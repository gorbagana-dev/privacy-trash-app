# Privacy Trash Frontend

Next.js frontend for Privacy Trash private GOR transfers.

## Development

Run commands from the `privacy-trash-app` workspace root:

```sh
npm install
npm run dev:frontend
```

## Scripts

- `npm run dev:frontend` - start the Next.js dev server.
- `npm run build -w @gorbagana/privacy-trash-frontend` - build the frontend.
- `npm run typecheck -w @gorbagana/privacy-trash-frontend` - run TypeScript checks.
- `npm run test -w @gorbagana/privacy-trash-frontend` - run frontend Vitest tests.
- `npm run lint -w @gorbagana/privacy-trash-frontend` - run ESLint.

The frontend depends on `@gorbagana/privacy-trash-client` for private note
scanning and protocol workflow code. It should not duplicate indexer, note
decryption, proof, or transaction-building logic.

Hasher WASM files are served from `public/vendor/lightprotocol/hasher.rs`.
The workspace `postinstall` script also repairs the upstream package layout
required by Turbopack's static WASM resolution.
