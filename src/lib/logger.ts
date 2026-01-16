/**
 * Logger Utility
 *
 * Centralised logging with consistent formatting and environment-aware output.
 * In production, logs are structured and may be sent to external logging services.
 */

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

/**
 * Get the current log level from environment
 */
function getCurrentLogLevel(): LogLevel {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'test') return LogLevel.ERROR;
  if (env === 'production') return LogLevel.WARN;
  return LogLevel.DEBUG; // development
}

/**
 * Format log entry with timestamp and context
 */
function formatLogEntry(
  level: LogLevel,
  message: string,
  context?: string
): string {
  const timestamp = new Date().toISOString();
  const levelName = LOG_LEVEL_NAMES[level];
  const contextStr = context ? `[${context}] ` : '';
  return `${timestamp} ${levelName} ${contextStr}${message}`;
}

/**
 * Sanitise sensitive data from logs
 */
function sanitise(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitise);
  }

  const sanitised: Record<string, unknown> = {};
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'session'];

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(k => lowerKey.includes(k))) {
      sanitised[key] = '[REDACTED]';
    } else {
      sanitised[key] = sanitise(value);
    }
  }

  return sanitised;
}

/**
 * Core logging function
 */
function log(level: LogLevel, message: string, meta?: Record<string, unknown>, context?: string): void {
  const currentLevel = getCurrentLogLevel();

  if (level < currentLevel) {
    return;
  }

  const formattedMessage = formatLogEntry(level, message, context);

  if (meta) {
    const sanitisedMeta = sanitise(meta);
    console.log(formattedMessage, sanitisedMeta);
  } else {
    console.log(formattedMessage);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void;
}

/**
 * Create a contextual logger
 */
export function createLogger(context: string): Logger {
  return {
    debug: (message: string, meta?: Record<string, unknown>) =>
      log(LogLevel.DEBUG, message, meta, context),
    info: (message: string, meta?: Record<string, unknown>) =>
      log(LogLevel.INFO, message, meta, context),
    warn: (message: string, meta?: Record<string, unknown>) =>
      log(LogLevel.WARN, message, meta, context),
    error: (message: string, error?: Error | unknown, meta?: Record<string, unknown>) => {
      const errorMeta = error instanceof Error
        ? { ...meta, error: error.message, stack: error.stack }
        : { ...meta, error };
      log(LogLevel.ERROR, message, errorMeta, context);
    },
  };
}

/**
 * Default logger instance
 */
export const logger = createLogger('app');

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const debug = (message: string, meta?: Record<string, unknown>) =>
  logger.debug(message, meta);

export const info = (message: string, meta?: Record<string, unknown>) =>
  logger.info(message, meta);

export const warn = (message: string, meta?: Record<string, unknown>) =>
  logger.warn(message, meta);

export const error = (message: string, err?: Error | unknown, meta?: Record<string, unknown>) =>
  logger.error(message, err, meta);
