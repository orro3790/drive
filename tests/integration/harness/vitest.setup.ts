import { vi } from 'vitest';

// SvelteKit's $lib alias resolution happens before Vite aliasing in some
// contexts. Use an explicit Vitest mock to guarantee that all app imports of
// `$lib/server/db` resolve to the integration-safe client.
vi.mock('$lib/server/db', async () => {
	return await import('../../../src/lib/server/db/test-client');
});
