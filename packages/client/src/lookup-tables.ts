import {
  compressTransactionMessageUsingAddressLookupTables,
  fetchAddressesForLookupTables,
  type Address,
  type GetMultipleAccountsApi,
  type Rpc,
} from "@solana/kit";
import type { AddressesByLookupTableAddress } from "@solana/kit";

import type { ChainTransactionMessage } from "@/chain";
import { addressSchema } from "@/schemas";
import type { TransactionMessageCompressor } from "@/transaction-executor";

export type CreateAddressLookupTableCompressorInput = {
  rpc: Rpc<GetMultipleAccountsApi>;
  lookupTableAddresses: readonly string[];
};

export function createAddressLookupTableCompressor(
  input: CreateAddressLookupTableCompressorInput,
): TransactionMessageCompressor {
  const lookupTableAddresses = input.lookupTableAddresses.map((value) =>
    addressSchema.parse(value),
  );
  let cachedAddresses:
    | Promise<AddressesByLookupTableAddress>
    | AddressesByLookupTableAddress
    | null = null;

  return async (transactionMessage) => {
    if (lookupTableAddresses.length === 0) {
      return transactionMessage;
    }

    const addressesByLookupTableAddress =
      await getAddressesByLookupTableAddress({
        rpc: input.rpc,
        lookupTableAddresses,
        cachedAddresses,
        setCachedAddresses(value) {
          cachedAddresses = value;
        },
      });

    return compressTransactionMessageUsingAddressLookupTables(
      transactionMessage,
      addressesByLookupTableAddress,
    ) as ChainTransactionMessage;
  };
}

async function getAddressesByLookupTableAddress(input: {
  rpc: Rpc<GetMultipleAccountsApi>;
  lookupTableAddresses: readonly Address[];
  cachedAddresses:
    | Promise<AddressesByLookupTableAddress>
    | AddressesByLookupTableAddress
    | null;
  setCachedAddresses(
    value: Promise<AddressesByLookupTableAddress> | AddressesByLookupTableAddress,
  ): void;
}): Promise<AddressesByLookupTableAddress> {
  if (input.cachedAddresses !== null) {
    return await input.cachedAddresses;
  }

  const fetchPromise = fetchAddressesForLookupTables(
    [...input.lookupTableAddresses],
    input.rpc,
  );
  input.setCachedAddresses(fetchPromise);
  const addresses = await fetchPromise;
  input.setCachedAddresses(addresses);

  return addresses;
}
