import type { Idl } from "@coral-xyz/anchor";

export const zkcashEventIdl = {
  address: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
  metadata: {
    name: "zkcash",
    version: "0.1.0",
    spec: "0.1.0",
    description: "Anchor program for zkcash",
  },
  instructions: [],
  events: [
    {
      name: "CommitmentData",
      discriminator: [13, 110, 215, 127, 244, 62, 234, 34],
    },
  ],
  types: [
    {
      name: "CommitmentData",
      type: {
        kind: "struct",
        fields: [
          {
            name: "index",
            type: "u64",
          },
          {
            name: "commitment",
            type: {
              array: ["u8", 32],
            },
          },
          {
            name: "encrypted_output",
            type: "bytes",
          },
        ],
      },
    },
  ],
} satisfies Idl;
