/* eslint-disable no-console */
/**
 * Pino Logger Configuration
 * 
 * - Development: Pretty-printed, colorful logs
 * - Production: Silent (no output)
 * 
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('Message here');
 *   logger.error('Error occurred', { details: error });
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

// Create the pino instance
const pinoLogger = pino({
  // In production, set level to 'silent' to suppress all logs
  level: isDevelopment ? 'debug' : 'silent',
  
  // Browser-specific configuration
  browser: {
    // In development, use console methods; in production, disable
    asObject: false,
    write: isDevelopment
      ? {
          debug: (o) => console.debug(o),
          info: (o) => console.info(o),
          warn: (o) => console.warn(o),
          error: (o) => console.error(o),
        }
      : {
          // Silent in production - no output
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        },
  },
  
  // Pretty formatting in development (only works in Node.js, not browser)
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

// Create a wrapper that supports (message, object) signature which is more common in this codebase
const customLogger = {
  debug: (msg: string, ...args: unknown[]) => {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null && args.length === 1) {
       pinoLogger.debug(args[0] as object, msg);
    } else {
       pinoLogger.debug({ context: args }, msg);
    }
  },
  info: (msg: string, ...args: unknown[]) => {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null && args.length === 1) {
       pinoLogger.info(args[0] as object, msg);
    } else {
       pinoLogger.info({ context: args }, msg);
    }
  },
  warn: (msg: string, ...args: unknown[]) => {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null && args.length === 1) {
       pinoLogger.warn(args[0] as object, msg);
    } else {
       pinoLogger.warn({ context: args }, msg);
    }
  },
  error: (msg: string, ...args: unknown[]) => {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null && args.length === 1) {
       pinoLogger.error(args[0] as object, msg);
    } else {
       pinoLogger.error({ context: args }, msg);
    }
  },
};

// Export the wrapper as 'logger' to support: logger.info('msg', obj)
export const logger = customLogger;

// Export 'log' as an alias for backward compatibility
export const log = customLogger;

export default logger;
