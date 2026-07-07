export default {
  "*.{ts,tsx,js,jsx}": ["oxfmt", "oxlint --fix --max-warnings 0"],
  "*.{ts,tsx}": [() => "tsgo --noEmit", () => "pnpm run test"],
  "**/*": ["secretlint --secretlintignore .gitignore", "cspell --no-must-find-files"],
  // Regenerate AI tool configs when rulesync source files change
  ".rulesync/**": [() => "pnpm generate"],
};
