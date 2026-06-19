import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@gorbagana/privacy-trash-client"],
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
