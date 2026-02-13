import path from 'node:path';

import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		}),
		sveltekit()
	],
	resolve: {
		alias: [
			// Redirect all app DB access to a Node Postgres client for integration tests.
			{
				find: '$lib/server/db',
				replacement: path.resolve(__dirname, './src/lib/server/db/test-client.ts')
			},
			{
				find: /[\\/]src[\\/]lib[\\/]server[\\/]db(?:[\\/]index\.(?:ts|js))?(?:\?.*)?$/,
				replacement: path.resolve(__dirname, './src/lib/server/db/test-client.ts')
			}
		]
	},
	test: {
		include: ['tests/integration/**/*.smoke.test.ts'],
		environment: 'node',
		globalSetup: ['tests/integration/harness/globalSetup.ts'],
		setupFiles: ['tests/integration/harness/vitest.setup.ts'],
		testTimeout: 60_000,
		hookTimeout: 60_000,

		// Real DB tests must be deterministic; start sequential and relax later if needed.
		pool: 'forks',
		maxWorkers: 1,
		fileParallelism: false,
		isolate: true,

		env: {
			INTEGRATION_TEST: '1'
		}
	}
});
