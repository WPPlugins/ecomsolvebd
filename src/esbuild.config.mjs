import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const banner = "/* EcomSolveBD Tracker — lightweight analytics snippet */";

await esbuild.build({
  entryPoints: ["src/browser-global.js"],
  bundle: true,
  format: "iife",
  globalName: "EcomSolveBDTracker",
  outfile: "dist/f-commerce-tracker.js",
  platform: "browser",
  target: ["es2018"],
  minify: true,
  legalComments: "none",
  banner: { js: banner },
});

await esbuild.build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/f-commerce-tracker.esm.js",
  platform: "browser",
  target: ["es2018"],
  minify: true,
  legalComments: "none",
  banner: { js: banner },
});

console.log("Built dist/f-commerce-tracker.js (IIFE) and dist/f-commerce-tracker.esm.js (ESM)");
