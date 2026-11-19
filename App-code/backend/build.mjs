import { build } from "esbuild";

// Bundles the Lambda into a single dist/index.js. AWS SDK v3 packages are marked
// external because the Node.js 20.x Lambda runtime already provides them, which
// keeps the deployment zip (and cold start) small.
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.js",
  external: ["@aws-sdk/*"],
  sourcemap: false,
  minify: true,
});

console.log("Backend bundled to dist/index.js");
