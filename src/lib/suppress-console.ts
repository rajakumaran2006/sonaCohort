/* eslint-disable no-console */
/**
 * Production Console Suppressor
 * 
 * This module overrides all console methods in production to prevent
 * any logging from appearing in the browser console.
 * 
 * Import this file early in your application (e.g., in layout.tsx)
 * to ensure all console output is suppressed in production.
 */

const isProduction = process.env.NODE_ENV === 'production';

// Only suppress console in production
if (isProduction && typeof window !== 'undefined') {
  // Store original console methods (in case needed for emergencies)
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
    trace: console.trace,
    dir: console.dir,
    table: console.table,
    group: console.group,
    groupEnd: console.groupEnd,
    groupCollapsed: console.groupCollapsed,
    time: console.time,
    timeEnd: console.timeEnd,
    timeLog: console.timeLog,
    assert: console.assert,
    count: console.count,
    countReset: console.countReset,
  };

  // Store in window for emergency debugging access
  // Access via: window.__originalConsole.log('emergency debug')
  (window as unknown as { __originalConsole: typeof originalConsole }).__originalConsole = originalConsole;

  // Create a no-op function
  const noop = () => {};

  // Override all console methods with no-op
  console.log = noop;
  console.warn = noop;
  console.error = noop;
  console.info = noop;
  console.debug = noop;
  console.trace = noop;
  console.dir = noop;
  console.table = noop;
  console.group = noop;
  console.groupEnd = noop;
  console.groupCollapsed = noop;
  console.time = noop;
  console.timeEnd = noop;
  console.timeLog = noop;
  console.assert = noop;
  console.count = noop;
  console.countReset = noop;
}

// Export for module resolution
export {};
