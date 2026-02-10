import pino, { type DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';

import {
	REDACTED,
	allowedOperationalIdFields,
	getLoggerRedactionConfig,
	sensitiveLogPaths
} from '../../src/lib/server/logger';

type LoggedEntry = Record<string, unknown>;

function createCapturingStream(entries: LoggedEntry[]): DestinationStream {
	return {
		write(chunk: string | Uint8Array) {
			const raw = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
			entries.push(JSON.parse(raw) as LoggedEntry);
			return true;
		}
	} as unknown as DestinationStream;
}

describe('logger redaction policy', () => {
	it('redacts sensitive fields while preserving operational identifiers', () => {
		const entries: LoggedEntry[] = [];
		const logger = pino(
			{
				base: null,
				timestamp: false,
				redact: getLoggerRedactionConfig()
			},
			createCapturingStream(entries)
		);

		logger.info({
			requestId: 'req_123',
			userId: 'user_123',
			assignmentId: 'asn_123',
			email: 'john@example.com',
			token: 'secret-token',
			headers: {
				authorization: 'Bearer abc123',
				cookie: 'session=abc123'
			},
			context: {
				apiKey: 'api-key-123',
				ip: '203.0.113.10'
			}
		});

		const entry = entries[0];
		expect(entry).toBeDefined();

		expect(entry.requestId).toBe('req_123');
		expect(entry.userId).toBe('user_123');
		expect(entry.assignmentId).toBe('asn_123');

		expect(entry.email).toBe(REDACTED);
		expect(entry.token).toBe(REDACTED);

		const headers = entry.headers as { authorization?: string; cookie?: string };
		expect(headers.authorization).toBe(REDACTED);
		expect(headers.cookie).toBe(REDACTED);

		const context = entry.context as { apiKey?: string; ip?: string };
		expect(context.apiKey).toBe(REDACTED);
		expect(context.ip).toBe(REDACTED);
	});

	it('keeps approved operational identifiers out of redaction paths', () => {
		for (const field of allowedOperationalIdFields) {
			expect(sensitiveLogPaths).not.toContain(field);
			expect(sensitiveLogPaths).not.toContain(`*.${field}`);
		}
	});
});
