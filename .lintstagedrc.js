export default {
  "*.{ts,tsx,js,jsx}": ["oxfmt", "oxlint --fix --max-warnings 0"],
  "*.{ts,tsx}": [() => "tsgo --noEmit", () => "bun test"],
  "**/*": ["secretlint --secretlintignore .gitignore", "cspell --no-must-find-files"],
};
