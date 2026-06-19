import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const packageDist = join(
  process.cwd(),
  "node_modules",
  "@lightprotocol",
  "hasher.rs",
  "dist",
);
const browserTarget = join(packageDist, "browser-fat", "es");
const wasmFiles = [
  "hasher_wasm_simd_bg.wasm",
  "light_wasm_hasher_bg.wasm",
];

mkdirSync(browserTarget, { recursive: true });

for (const file of wasmFiles) {
  const source = join(packageDist, file);
  const target = join(browserTarget, file);

  if (!existsSync(source)) {
    throw new Error(`Missing @lightprotocol/hasher.rs WASM file: ${file}`);
  }

  copyFileSync(source, target);
}
