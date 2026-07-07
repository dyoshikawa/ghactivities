import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  fixedExtension: false,
});
