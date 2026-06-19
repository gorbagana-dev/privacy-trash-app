import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import renderVisitor from "@codama/renderers-js";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { createFromRoot } from "codama";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const idlPath = path.join(packageRoot, "idl", "zkcash.json");

const anchorIdl = JSON.parse(await readFile(idlPath, "utf8"));
const codama = createFromRoot(rootNodeFromAnchor(anchorIdl));

await codama.accept(
  renderVisitor(packageRoot, {
    generatedFolder: "src/generated",
    deleteFolderBeforeRendering: true,
    formatCode: true,
    syncPackageJson: true,
  }),
);

console.log("Generated Privacy Trash client in src/generated.");
