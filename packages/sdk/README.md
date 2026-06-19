# Privacy Trash SDK

TypeScript SDK for the deployed Privacy Trash program.

The SDK exposes the contract-facing API. Apps should import from the package root.

## Install

This package is part of the workspace:

```sh
npm install
```

## Public API

| Export | Description |
| --- | --- |
| `programAddress` | Deployed program address |
| `findPoolAddresses` | Derive pool account addresses |
| `findPoolAddressValues` | Derive pool account address strings |
| `fetchPoolState` | Fetch pool state |
| `buildInitializeInstruction` | Build the initialize instruction |
| `buildTransactInstruction` | Build the transact instruction |
| `identifyInstruction` | Identify a program instruction |
| `parseInstruction` | Parse a program instruction |
| `contractErrorCodes` | Known program error codes |
| `getContractError` | Get a program error by code |
| `parseContractError` | Parse a program error from a thrown value |

## Examples

```ts
import { findPoolAddressValues, programAddress } from "@gorbagana/privacy-trash-sdk";

const pool = await findPoolAddressValues();

console.log(programAddress, pool.globalConfig);
```

```ts
import { buildTransactInstruction } from "@gorbagana/privacy-trash-sdk";

const instruction = await buildTransactInstruction({
  signer,
  recipient,
  feeRecipient,
  nullifiers,
  proof,
  extData,
  encryptedOutput1,
  encryptedOutput2,
});
```
