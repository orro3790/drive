import path from 'node:path';

import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const testClientPath = path.resolve(process.cwd(), 'src/lib/server/db/test-client.ts');

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
			//
			// We alias both the $lib import and the resolved filesystem path because
			// SvelteKit/Vite can normalize aliases before Rollup aliasing runs.
			{
				find: '$lib/server/db',
				replacement: testClientPath
			},
			{
				find: /[\\/]src[\\/]lib[\\/]server[\\/]db(?:[\\/]index\.(?:ts|js))?(?:\?.*)?$/,
				replacement: testClientPath
			}
		]
	},
	test: {
		include: ['tests/integration/**/*.test.ts'],
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
