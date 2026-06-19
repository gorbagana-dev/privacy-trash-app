import { z } from "zod";

import type {
  MerkleProof,
  MerkleProofInput,
  NullifierStatusInput,
} from "@/indexer";
import {
  encryptedOutputSchema,
  type NoteBackup,
  type NoteStore,
} from "@/notes";
import {
  proofMaterialSchema,
  type ProofProvider,
} from "@/proof";
import {
  addressSchema,
  fieldElementHexSchema,
  positiveLamportsSchema,
} from "@/schemas";
import {
  prepareTransferInputSchema,
  type PrepareTransferInput,
} from "@/transfer";
import { utxoWitnessSchema, type UtxoWitness } from "@/utxo";

const commitmentSchema = z
  .string()
  .trim()
  .refine(
    (value) => /^\d+$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value),
    "Expected a decimal field element or 32-byte hex commitment.",
  )
  .transform((value) => value.toLowerCase());

const spendableNoteSchema = z.strictObject({
  commitment: commitmentSchema,
  encryptedOutput: encryptedOutputSchema,
  nullifier: fieldElementHexSchema,
  amountLamports: positiveLamportsSchema,
  witness: utxoWitnessSchema,
});

const selectedNotesSchema = z.strictObject({
  inputNotes: z.array(spendableNoteSchema).min(1).max(2),
});

const nullifierStatusSchema = z.object({
  spent: z.boolean(),
  nullifier: fieldElementHexSchema,
});

export type ProverIndexer = {
  getMerkleProof(input: MerkleProofInput): Promise<MerkleProof>;
  getNullifierStatus(input: NullifierStatusInput): Promise<unknown>;
};

export type SpendableNote = z.infer<typeof spendableNoteSchema>;
export type SelectedNotes = z.infer<typeof selectedNotesSchema>;
export type MerkleProofEntry = MerkleProof["proofs"][number];

export type NoteSelectionInput = {
  transfer: PrepareTransferInput;
  backup: NoteBackup;
};

export type NoteSelector = {
  selectNotes(input: NoteSelectionInput): Promise<unknown>;
};

export type CircuitInputNote = SpendableNote & {
  merkleProof: MerkleProofEntry;
};

export type CircuitAmounts = {
  recipientLamports: bigint;
  grossWithdrawalLamports: bigint;
  withdrawalFeeLamports: bigint;
  shieldLamports: bigint;
  privateBalanceLamports: bigint;
  selectedInputLamports: bigint;
  changeLamports: bigint;
};

export type CircuitInput = {
  transfer: PrepareTransferInput;
  programAddress: string;
  ownerAddress: string;
  recipient: string;
  merkleRoot: string;
  treeHeight: number;
  nextIndex: number;
  amounts: CircuitAmounts;
  inputNotes: CircuitInputNote[];
};

export type CircuitProver = {
  prove(input: CircuitInput): Promise<unknown>;
};

export type CreateProverProofProviderInput = {
  notes: NoteStore;
  indexer: ProverIndexer;
  noteSelector: NoteSelector;
  circuitProver: CircuitProver;
  programAddress: string;
  ownerAddress: string;
  now?: (() => Date) | undefined;
};

export function createProverProofProvider(
  input: CreateProverProofProviderInput,
): ProofProvider {
  const programAddress = addressSchema.parse(input.programAddress);
  const ownerAddress = addressSchema.parse(input.ownerAddress);
  const now = input.now ?? (() => new Date());

  return {
    async createProofMaterial(transferInput) {
      const transfer = prepareTransferInputSchema.parse(transferInput);

      if (transfer.programAddress !== programAddress) {
        throw new Error("Transfer program address does not match prover scope.");
      }

      if (transfer.ownerAddress !== ownerAddress) {
        throw new Error("Transfer owner address does not match prover scope.");
      }

      const backup = input.notes.exportNotes({
        programAddress,
        ownerAddress,
        exportedAt: getValidDate(now()),
      });
      const selectedNotes = selectedNotesSchema.parse(
        await input.noteSelector.selectNotes({
          transfer,
          backup,
        }),
      );

      validateSelectedNotes(selectedNotes, backup);
      await validateUnspentNotes(input.indexer, selectedNotes);

      const merkleProof = await input.indexer.getMerkleProof({
        commitments: selectedNotes.inputNotes.map((note) => note.commitment),
      });

      validateMerkleProof(selectedNotes, merkleProof);

      return proofMaterialSchema.parse(
        await input.circuitProver.prove(
          createCircuitInput({
            transfer,
            selectedNotes,
            merkleProof,
          }),
        ),
      );
    },
  };
}

function validateSelectedNotes(
  selectedNotes: SelectedNotes,
  backup: NoteBackup,
): void {
  const encryptedOutputs = new Set(backup.encryptedOutputs);

  for (const note of selectedNotes.inputNotes) {
    if (!encryptedOutputs.has(note.encryptedOutput)) {
      throw new Error("Selected note is not in the local note backup.");
    }

    if (!commitmentMatchesWitness(note.commitment, note.witness)) {
      throw new Error("Selected note commitment does not match its witness.");
    }

    if (note.nullifier !== note.witness.nullifierHex) {
      throw new Error("Selected note nullifier does not match its witness.");
    }

    if (note.amountLamports !== note.witness.amountLamports) {
      throw new Error("Selected note amount does not match its witness.");
    }
  }
}

async function validateUnspentNotes(
  indexer: ProverIndexer,
  selectedNotes: SelectedNotes,
): Promise<void> {
  const statuses = await Promise.all(
    selectedNotes.inputNotes.map((note) =>
      indexer.getNullifierStatus({ nullifier: note.nullifier }),
    ),
  );

  for (const [index, statusInput] of statuses.entries()) {
    const status = nullifierStatusSchema.parse(statusInput);
    const note = selectedNotes.inputNotes[index];

    if (note === undefined) {
      throw new Error("Selected note status index is out of bounds.");
    }

    if (status.nullifier !== note.nullifier) {
      throw new Error("Indexer returned a nullifier status for the wrong note.");
    }

    if (status.spent) {
      throw new Error("Selected note has already been spent.");
    }
  }
}

function validateMerkleProof(
  selectedNotes: SelectedNotes,
  merkleProof: MerkleProof,
): void {
  if (merkleProof.proofs.length !== selectedNotes.inputNotes.length) {
    throw new Error("Indexer returned a mismatched Merkle proof count.");
  }

  for (const [index, note] of selectedNotes.inputNotes.entries()) {
    const proof = merkleProof.proofs[index];

    if (proof === undefined || !proof.found || proof.outputIndex === null) {
      throw new Error("Indexer did not return a Merkle proof for a selected note.");
    }

    if (
      proof.commitmentHex !== note.commitment &&
      proof.commitment !== note.commitment
    ) {
      throw new Error("Indexer returned a Merkle proof for the wrong commitment.");
    }
  }
}

function createCircuitInput(input: {
  transfer: PrepareTransferInput;
  selectedNotes: SelectedNotes;
  merkleProof: MerkleProof;
}): CircuitInput {
  const inputNotes = input.selectedNotes.inputNotes.map((note, index) => {
    const merkleProof = input.merkleProof.proofs[index];

    if (merkleProof === undefined) {
      throw new Error("Missing Merkle proof for selected note.");
    }

    return {
      ...note,
      merkleProof,
    };
  });
  const selectedInputLamports = inputNotes.reduce(
    (sum, note) => sum + note.amountLamports,
    0n,
  );
  const grossWithdrawalLamports =
    input.transfer.quote.grossWithdrawalLamports;

  if (selectedInputLamports < grossWithdrawalLamports) {
    throw new Error("Selected notes do not cover the gross withdrawal.");
  }

  return {
    transfer: input.transfer,
    programAddress: input.transfer.programAddress,
    ownerAddress: input.transfer.ownerAddress,
    recipient: input.transfer.recipient,
    merkleRoot: input.merkleProof.root,
    treeHeight: input.merkleProof.treeHeight,
    nextIndex: input.merkleProof.nextIndex,
    amounts: {
      recipientLamports: input.transfer.quote.recipientLamports,
      grossWithdrawalLamports,
      withdrawalFeeLamports: input.transfer.quote.withdrawalFeeLamports,
      shieldLamports: input.transfer.quote.shieldLamports,
      privateBalanceLamports: input.transfer.quote.privateBalanceLamports,
      selectedInputLamports,
      changeLamports: selectedInputLamports - grossWithdrawalLamports,
    },
    inputNotes,
  };
}

function commitmentMatchesWitness(
  commitment: string,
  witness: UtxoWitness,
): boolean {
  if (commitment === witness.commitment) return true;
  if (/^[0-9a-f]{64}$/.test(commitment)) {
    return BigInt(`0x${commitment}`).toString() === witness.commitment;
  }

  return false;
}

function getValidDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("now must return a valid Date.");
  }

  return value;
}
