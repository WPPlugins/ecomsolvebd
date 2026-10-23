/** @param {string} key */
export function lsGet(key) {
  try {
    if (typeof localStorage === "undefined") return "";
    return String(localStorage.getItem(key) || "");
  } catch {
    return "";
  }
}

/** @param {string} key @param {string} value */
export function lsSet(key, value) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
