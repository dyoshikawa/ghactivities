---
root: false
targets: ["*"]
description: "When you write any code, must follow these guidelines."
globs: ["**/*.ts"]
---

# Coding Guidelines

- If the arguments are multiple, you should use an object as the argument.
  - This applies to both function arguments and class constructor arguments.
- If you have to write validation logic, please consider using `zod/mini` to do it actively.
  - `zod/mini` is a subset of `zod` that minimizes the bundle size. CLI options are validated with a `zod/mini` schema in `src/cli/parse-args.ts`.
- To import code, you should always use static imports. You should not use dynamic imports.
  - Because static imports are easier to analyze and optimize by bundlers such as tree-shaking.
- TypeScript file names should be in kebab-case, even for class implementation files.
- Don't create barrel files. Please always import the implementation file directly.
  - The maintainer thinks that barrel files are harmful to tree-shaking and import path transparency.
- When logging errors, you must use the `formatError` function in `src/utils/error.ts` to format the error message.
- When writing any path, you must always use the `join` function from `node:path` to join the path because it must support both Windows and Unix-like paths.
- The CLI reports argument-validation errors through `@clack/prompts`, which writes to **stdout** (not stderr) and exits non-zero. Keep this in mind when adding new validation.
