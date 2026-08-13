/** Shared ESLint preset for ai-km apps and packages. */
module.exports = {
  root: true,
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  env: { es2022: true, node: true },
  ignorePatterns: ["dist/", ".next/", "node_modules/"],
};
