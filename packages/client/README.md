# Privacy Trash Client

TypeScript client package for Privacy Trash private GOR transfers.

Use this package when an app needs to unlock a wallet, read private balance, prepare deposits, prepare transfers, generate proof material, and submit transactions.

## Install

This package is part of the workspace:

```sh
npm install
```

## Main Entry

```ts
import { createPrivateClient } from "@gorbagana/privacy-trash-client";
```

`createPrivateClient` creates the default browser client for Privacy Trash.

## Browser Entry

```ts
import {
  createBrowserStorage,
  createWalletMessageSigner,
  loadCircuitArtifacts,
  loadHasher,
} from "@gorbagana/privacy-trash-client/browser";
```

Use the browser entry for wallet message signing, local storage, hasher loading, and circuit asset loading.

## Common Exports

| Export | Description |
| --- | --- |
| `createPrivateClient` | Create the app client |
| `createClient` | Create a lower-level injectable client |
| `quoteDeposit` | Quote a private deposit |
| `prepareDeposit` | Prepare a deposit |
| `sendDeposit` | Send a prepared deposit |
| `quoteTransfer` | Quote a private transfer |
| `prepareTransfer` | Prepare a transfer |
| `sendTransfer` | Send a prepared transfer |
| `createIndexer` | Read backend indexer data |
| `createProofRunner` | Run Groth16 proof generation |
| `createAddressLookupTableCompressor` | Compile smaller transactions with an address lookup table |
| `parseAmount` | Parse GOR into lamports |
| `formatAmount` | Format lamports as GOR |

## Scripts

| Command | Description |
| --- | --- |
| `npm run build -w @gorbagana/privacy-trash-client` | Build the package |
| `npm run typecheck -w @gorbagana/privacy-trash-client` | Run TypeScript checks |
| `npm run test -w @gorbagana/privacy-trash-client` | Run tests |
| `npm run lint -w @gorbagana/privacy-trash-client` | Run linting |
