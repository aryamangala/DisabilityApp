/**
 * Development-only logging. Strips all `console` noise from production JS bundles.
 */
export function devLog(...args) {
  if (__DEV__) console.log(...args);
}

export function devWarn(...args) {
  if (__DEV__) console.warn(...args);
}

export function devError(...args) {
  if (__DEV__) console.error(...args);
}
