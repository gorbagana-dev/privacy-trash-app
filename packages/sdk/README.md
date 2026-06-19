# Privacy Trash SDK

Contract-only TypeScript SDK for the deployed Privacy Trash program.

The public API is native GOR-only. Generated Codama code stays internal; apps should import from the package root.

Current surface:

- `programAddress`
- `findPoolAddresses()`
- `findPoolAddressValues()`
- `fetchPoolState()`
- `buildInitializeInstruction()`
- `buildTransactInstruction()`
- `identifyInstruction()`
- `parseInstruction()`
- `contractErrorCodes`
- `getContractError()`
- `parseContractError()`

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

```ts
import { parseContractError } from "@gorbagana/privacy-trash-sdk";

const parsed = parseContractError(error, transactionMessage);

if (parsed) {
  console.error(`${parsed.name}: ${parsed.message}`);
}
```
