import tracker from "./index.js";

const g = typeof globalThis !== "undefined" ? globalThis : /** @type {any} */ (typeof window !== "undefined" ? window : {});
g.EcomSolveBDTracker = tracker;
export default tracker;
