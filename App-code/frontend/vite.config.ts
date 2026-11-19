import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // Small, self-contained bundle — easier to audit and cache-bust with content hashes.
    target: "es2022",
    sourcemap: true,
  },
});
