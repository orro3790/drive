/**
 * Structured Logging with Pino + Axiom
 *
 * - Development: Pretty-printed colored logs
 * - Production: JSON logs shipped to Axiom
 */

import pino from 'pino';
import { dev } from '$app/environment';

// Axiom config from env (only needed in production)
const AXIOM_DATASET = 'driver-ops';
const AXIOM_TOKEN = process.env.AXIOM_TOKEN;

// Build transport configuration
function getTransport() {
	if (dev) {
		// Development: pretty print to console
		return {
			target: 'pino-pretty',
			options: {
				colorize: true,
				translateTime: 'yyyy-mm-dd HH:MM:ss',
				ignore: 'pid,hostname'
			}
		};
	}

	if (AXIOM_TOKEN) {
		// Production with Axiom: ship logs
		return {
			target: '@axiomhq/pino',
			options: {
				dataset: AXIOM_DATASET,
				token: AXIOM_TOKEN
			}
		};
	}

	// Production without Axiom: JSON to stdout (Vercel captures this)
	return undefined;
}

const baseLoggerConfig = {
	level: dev ? 'debug' : 'info',
	formatters: {
		level: (label: string) => ({ level: label })
	},
	timestamp: pino.stdTimeFunctions.isoTime,
	base: {
		service: 'drive'
	}
};

function createLogger() {
	const transport = getTransport();

	try {
		return pino({
			...baseLoggerConfig,
			transport
		});
	} catch (error) {
		if (
			transport &&
			error instanceof Error &&
			error.message.includes('unable to determine transport target')
		) {
			return pino(baseLoggerConfig);
		}

		throw error;
	}
}

const logger = createLogger();

/**
 * Create a child logger with context fields
 *
 * @example
 * const log = createContextLogger({ userId: '123', operation: 'createBid' });
 * log.info({ bidId }, 'Bid created');
 * log.error({ error: err.message }, 'Bid failed');
 */
export function createContextLogger(context: Record<string, unknown>) {
	return logger.child(context);
}

/**
 * Redact sensitive fields from objects before logging
 */
export function redactSensitive<T extends Record<string, unknown>>(
	obj: T,
	sensitiveKeys: string[] = [
		'password',
		'token',
		'api_key',
		'apiKey',
		'secret',
		'authorization',
		'auth',
		'session',
		'cookie',
		'private_key',
		'privateKey'
	]
): T {
	const redacted = { ...obj };
	for (const key of Object.keys(redacted)) {
		if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
			(redacted as Record<string, unknown>)[key] = '[REDACTED]';
		}
	}
	return redacted;
}

export default logger;
