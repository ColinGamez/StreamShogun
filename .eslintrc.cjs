/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["@typescript-eslint", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/stylistic",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  rules: {
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
  ignorePatterns: [
    "dist",
    "dist-tsc",
    "dist-node",
    "release",
    "node_modules",
    "*.js",
    "*.cjs",
  ],
  overrides: [
    {
      files: ["**/__demo__/**"],
      rules: { "no-console": "off" },
    },
  ],
};
