import { defineConfig } from "vite-plus";

// One file configures the Vite+ toolchain: the package build (`vp pack`), the
// formatter (`fmt`), the linter (`lint`) and the pre-commit checks (`staged`).
// The tests keep their own configs: `vitest.config.ts` (unit) and
// `vitest.e2e.config.ts` (E2E).
export default defineConfig({
  // `vp pack` (tsdown). The package is a CLI: `dist/index.js` (ESM) is the
  // `bin`, and the CJS copy plus the (empty) declaration files keep the
  // `main` / `types` entries resolvable.
  pack: {
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
    },
    entry: ["src/cli/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    fixedExtension: false,
  },

  // `vp fmt` (Oxfmt).
  fmt: {
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    arrowParens: "always",
    experimentalSortImports: {},
    ignorePatterns: [
      "package.json",
      "node_modules/**",
      "dist/**",
      "dist*/**",
      ".claude/settings.json",
      ".rulesync/permissions.json",
      ".codex/config.toml",
    ],
  },

  // `vp lint` (Oxlint). Type checking stays with `tsgo` (`pnpm typecheck`):
  // Oxlint's type-aware mode would add rules this project does not use.
  lint: {
    plugins: ["typescript", "import", "unicorn"],
    // Vite+'s own rule, which reports `vite` / `vitest` imports that should
    // come from `vite-plus`.
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    categories: {
      correctness: "error",
      suspicious: "warn",
      style: "off",
      pedantic: "off",
    },
    rules: {
      complexity: ["error", { max: 20 }],
      eqeqeq: "error",
      "import/no-cycle": "error",
      "no-console": "off",
      "typescript/no-explicit-any": "warn",
      "unicorn/prefer-node-protocol": "error",
      "unicorn/no-array-reduce": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    env: {
      browser: false,
      node: true,
      es2024: true,
    },
    ignorePatterns: ["dist/**", "coverage/**", "*.d.ts", "node_modules/**"],
    overrides: [
      {
        files: ["**/*.test.ts"],
        rules: {
          "typescript/no-explicit-any": "off",
        },
      },
    ],
  },

  // `vp staged`, run by the pre-commit hook (`.vite-hooks/pre-commit`).
  staged: {
    "*.{ts,tsx,js,jsx}": ["vp fmt", "vp lint --fix --max-warnings 0"],
    "*.{ts,tsx}": [() => "tsgo --noEmit", () => "pnpm run test"],
    "**/*": ["secretlint --secretlintignore .gitignore", "cspell --no-must-find-files"],
    // Regenerate AI tool configs when rulesync source files change
    ".rulesync/**": [() => "pnpm generate"],
  },
});
