import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // The Marketplace worker is an independent Node package and runs its
    // native node:test suite through `npm run marketplace-worker:check`.
    exclude: [...configDefaults.exclude, "workers/**"]
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
