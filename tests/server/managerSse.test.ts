import { afterEach, describe, expect, it } from 'vitest';

import {
	broadcastAssignmentUpdated,
	createManagerSseStream
} from '../../src/lib/server/realtime/managerSse';

const decoder = new TextDecoder();
const READ_TIMEOUT_MS = 60;

type StreamReader = ReadableStreamDefaultReader<Uint8Array>;

const activeReaders: StreamReader[] = [];

function createReader(organizationId: string): StreamReader {
	const stream = createManagerSseStream(organizationId);
	const reader = stream.getReader();
	activeReaders.push(reader);
	return reader;
}

async function readChunk(
	reader: StreamReader,
	timeoutMs = READ_TIMEOUT_MS
): Promise<string | null> {
	const timeoutToken = Symbol('timeout');
	const result = await Promise.race<{ done: boolean; value?: Uint8Array } | typeof timeoutToken>([
		reader.read(),
		new Promise<typeof timeoutToken>((resolve) => {
			setTimeout(() => resolve(timeoutToken), timeoutMs);
		})
	]);

	if (result === timeoutToken) {
		return null;
	}

	if (result.done || !result.value) {
		return null;
	}

	return decoder.decode(result.value);
}

function parseSseData(chunk: string): unknown {
	const match = chunk.match(/data:\s*(.+)\n/);
	if (!match) {
		return null;
	}

	return JSON.parse(match[1]);
}

afterEach(async () => {
	while (activeReaders.length > 0) {
		const reader = activeReaders.pop();
		if (!reader) {
			continue;
		}

		await reader.cancel();
	}
});

describe('manager SSE organization scoping', () => {
	it('sends manager events only to the matching organization bucket', async () => {
		const orgAReader = createReader('org-a');
		const orgBReader = createReader('org-b');

		await readChunk(orgAReader);
		await readChunk(orgBReader);

		broadcastAssignmentUpdated('org-a', {
			assignmentId: 'assignment-1',
			status: 'scheduled',
			driverId: 'driver-1'
		});

		const orgAMessage = await readChunk(orgAReader);
		expect(orgAMessage).toContain('event: assignment:updated');
		expect(parseSseData(orgAMessage ?? '')).toEqual(
			expect.objectContaining({
				assignmentId: 'assignment-1',
				status: 'scheduled',
				driverId: 'driver-1'
			})
		);

		const orgBMessage = await readChunk(orgBReader);
		expect(orgBMessage).toBeNull();
	});

	it('requires organization context to create manager SSE streams', () => {
		expect(() => createManagerSseStream('')).toThrow(
			'Organization context is required for manager SSE stream'
		);
	});

	it('drops broadcasts without organization context', async () => {
		const reader = createReader('org-a');
		await readChunk(reader);

		broadcastAssignmentUpdated('', {
			assignmentId: 'assignment-1',
			status: 'scheduled',
			driverId: 'driver-1'
		});

		const nextMessage = await readChunk(reader);
		expect(nextMessage).toBeNull();
	});
});
