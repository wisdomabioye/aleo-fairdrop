/**
 * Minimal structured logger.
 *
 * Adds ISO timestamp and log level to every line. Respects LOG_LEVEL=debug
 * for verbose output. All other levels are always emitted.
 *
 * Usage:
 *   const log = createLogger('poll');
 *   log.info('starting');
 *   log.warn('behind finality buffer', { tip: 100, safe: 90 });
 *   log.error('tick failed', err);
 */

type Level = 'info' | 'warn' | 'error' | 'debug';

const DEBUG_ENABLED = process.env['LOG_LEVEL'] === 'debug';

function emit(level: Level, prefix: string, msg: string, meta?: unknown): void {
  if (level === 'debug' && !DEBUG_ENABLED) return;

  const ts  = new Date().toISOString();
  const tag = `${ts} [${level.toUpperCase().padEnd(5)}] [${prefix}]`;
  const out = level === 'error' ? console.error
            : level === 'warn'  ? console.warn
            : console.log;

  meta !== undefined ? out(tag, msg, meta) : out(tag, msg);
}

export interface Logger {
  info  (msg: string, meta?: unknown): void;
  warn  (msg: string, meta?: unknown): void;
  error (msg: string, meta?: unknown): void;
  debug (msg: string, meta?: unknown): void;
}

export function createLogger(prefix: string): Logger {
  return {
    info:  (msg, meta) => emit('info',  prefix, msg, meta),
    warn:  (msg, meta) => emit('warn',  prefix, msg, meta),
    error: (msg, meta) => emit('error', prefix, msg, meta),
    debug: (msg, meta) => emit('debug', prefix, msg, meta),
  };
}
