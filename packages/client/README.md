# Privacy Trash Client

TypeScript workflow package for Privacy Trash private GOR transfers.

This package sits above `@gorbagana/privacy-trash-sdk`. The SDK knows the
contract; this package coordinates wallet unlock, pool reads, note backups,
transfer quotes, proof material, and chain transaction execution.

Current modules:

- `amount.ts`: exact GOR parse/format helpers.
- `wallet.ts`: wallet address validation and stable note-unlock messages.
- `pool.ts`: fee config and private balance read boundaries.
- `indexer.ts`: HTTP reader for indexed public pool state and Merkle proofs.
- `notes.ts`: encrypted output backup format and scoped key/value storage.
- `sync.ts`: note sync between the indexer output stream and local storage.
- `owned.ts`: wallet-owned decrypted note interface and note selection.
- `transfer.ts`: quote math, approval data, prepared transfer contracts.
- `proof.ts`: proof material schema and provider boundary.
- `prover.ts`: composes local notes, indexer Merkle proofs, and a prover into a `ProofProvider`.
- `chain.ts`: prepared-transfer executor using Solana Kit and `privacy-trash-sdk`.
- `transaction-executor.ts`: runtime simulation, signing, sending, and confirmation.
- `private-transfer.ts`: internal composition root for proving plus chain execution.
- `client.ts`: app-facing composition root.

The package does not own frontend UI, wallet discovery, backend routing,
database persistence, or custody. `createPrivateClient` composes the default
GOR private-transfer stack from app dependencies: wallet message signer,
transaction signer, RPC, storage, indexer URL, fee config, hasher, circuit
proof runner or artifacts, and program addresses.

`createClient` remains the lower-level injectable primitive for tests or custom
runtimes. A backend can still implement individual boundaries when justified,
but frontend integration should start with `createPrivateClient`.

`createClient` accepts an optional `indexer`. When provided, `client.syncNotes()`
syncs encrypted output ranges into the scoped local note backup. Syncing does
not require wallet unlock because it only reads public encrypted pool outputs.

The `@gorbagana/privacy-trash-client/browser` entry exports browser-safe note
unlock and scan helpers. Frontends should call that entry instead of assembling
indexer, storage, hasher, and decryptor primitives themselves.
