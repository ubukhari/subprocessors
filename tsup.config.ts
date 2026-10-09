import { defineConfig } from "tsup";

/**
 * No runtime dependencies: npx installs one package, and the GitHub Action runs the committed
 * dist/ with no install. The vendor catalog is bundled into dist; the CLI makes no requests.
 */
export default defineConfig({
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  dts: { entry: { index: "src/index.ts" } },
  sourcemap: true,
  clean: true,
  splitting: false,
});
