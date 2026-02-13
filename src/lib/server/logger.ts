/**
 * Structured Logging with Pino + Axiom
 *
 * - Development: Pretty-printed colored logs
 * - Production: JSON logs shipped to Axiom
 */

import pino from 'pino';
import { dev } from '$app/environment';

// Axiom config from env (only needed in production)
const DEFAULT_AXIOM_DATASET = 'driver-ops';
const AXIOM_DATASET = process.env.AXIOM_DATASET?.trim() || DEFAULT_AXIOM_DATASET;
const AXIOM_TOKEN = process.env.AXIOM_TOKEN?.trim();

export const REDACTED = '[REDACTED]';

/**
 * Operational identifiers intentionally preserved in logs for incident debugging.
 *
 * Keep this list small and stable. Do not add direct PII fields here.
 */
export const allowedOperationalIdFields = [
	'userId',
	'driverId',
	'managerId',
	'organizationId',
	'reservationId',
	'assignmentId',
	'bidWindowId',
	'routeId',
	'warehouseId',
	'winnerId',
	'existingWindowId',
	'requestId'
] as const;

/**
 * Sensitive fields that must always be redacted before shipping logs.
 */
export const sensitiveFieldPaths = [
	'email',
	'token',
	'fcmToken',
	'authorization',
	'cookie',
	'session',
	'ip',
	'password',
	'secret',
	'apiKey',
	'api_key',
	'privateKey',
	'private_key',
	'headers.authorization',
	'headers.cookie'
] as const;

function buildSensitiveLogPaths(paths: readonly string[]): string[] {
	return [...paths, ...paths.map((path) => `*.${path}`)];
}

export const sensitiveLogPaths = buildSensitiveLogPaths(sensitiveFieldPaths);

export function getLoggerRedactionConfig() {
	return {
		paths: sensitiveLogPaths,
		censor: REDACTED
	} as const;
}

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
	redact: {
		...getLoggerRedactionConfig()
	},
	timestamp: pino.stdTimeFunctions.isoTime,
	base: {
		service: 'drive'
	}
};

type LoggerStartupMode = 'pretty' | 'axiom' | 'stdout-fallback';

type LoggerStartupSignal = {
	mode: LoggerStartupMode;
	reason?: 'missing_axiom_token' | 'axiom_transport_init_failed';
	errorType?: string;
};

function createLogger() {
	const transport = getTransport();
	const startupSignal: LoggerStartupSignal = dev
		? { mode: 'pretty' }
		: AXIOM_TOKEN
			? { mode: 'axiom' }
			: { mode: 'stdout-fallback', reason: 'missing_axiom_token' };

	try {
		return {
			logger: pino({
				...baseLoggerConfig,
				transport
			}),
			startupSignal
		};
	} catch (error) {
		if (transport) {
			return {
				logger: pino(baseLoggerConfig),
				startupSignal: {
					mode: 'stdout-fallback',
					reason: 'axiom_transport_init_failed',
					errorType: toSafeErrorMessage(error)
				}
			};
		}

		throw error;
	}
}

const { logger, startupSignal } = createLogger();

if (!dev && process.env.NODE_ENV !== 'test') {
	if (startupSignal.mode === 'axiom') {
		logger.info(
			{
				signal: 'observability.transport.axiom.enabled',
				axiomDataset: AXIOM_DATASET
			},
			'Axiom transport enabled'
		);
	}

	if (startupSignal.mode === 'stdout-fallback') {
		logger.warn(
			{
				signal: 'observability.transport.stdout_fallback',
				axiomDataset: AXIOM_DATASET,
				reason: startupSignal.reason,
				errorType: startupSignal.errorType
			},
			'Axiom transport unavailable; using stdout JSON logging'
		);
	}
}

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

export function toSafeErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.name || 'Error';
	}

	if (typeof error === 'string') {
		return 'Error';
	}

	return 'UnknownError';
}

/**
 * Extract structured error details for logging.
 *
 * Returns name, message, and stack separately so structured loggers
 * (Pino/Axiom) can index them. The message is always included — the
 * original `toSafeErrorMessage` intentionally omitted it to avoid
 * leaking PII into client responses, but server-side logs need the
 * full picture for debugging.
 */
export function toErrorDetails(error: unknown): {
	errorType: string;
	errorMessage: string;
	errorStack?: string;
} {
	if (error instanceof Error) {
		return {
			errorType: error.name || 'Error',
			errorMessage: error.message,
			errorStack: error.stack
		};
	}

	if (typeof error === 'string') {
		return {
			errorType: 'Error',
			errorMessage: error
		};
	}

	return {
		errorType: 'UnknownError',
		errorMessage: String(error)
	};
}

export default logger;
