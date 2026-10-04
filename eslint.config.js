/**
 * Flat ESLint config (ESLint 8+ file format; required for v9/v10).
 *
 * Rule parity with the former `.eslintrc.cjs`: core recommended +
 * typescript-eslint recommended + stylistic + react-hooks recommended,
 * Prettier last, same ignores and per-path overrides.
 */
const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");
const reactHooks = require("eslint-plugin-react-hooks");
const prettier = require("eslint-config-prettier");

module.exports = tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-tsc/**",
      "**/dist-node/**",
      "**/release/**",
      "**/generated/**",
      "**/node_modules/**",
      "**/*.js",
      "**/*.cjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      // react-hooks v7's compiler-era rules (purity, set-state-in-effect, …)
      // are intentionally not enabled yet: 17 pre-existing patterns would
      // need app-code changes. Keep v4 parity (hooks + exhaustive-deps);
      // adopt the new rules incrementally.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["**/__demo__/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["apps/api/prisma/seed.ts"],
    rules: { "no-console": "off" },
  },
  prettier,
);
