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
	test: {
		include: ['scripts/nightly/lifecycle-e2e.test.ts'],
		environment: 'node',
		setupFiles: ['scripts/nightly/lifecycle-e2e.setup.ts'],
		testTimeout: 12 * 60_000,
		hookTimeout: 12 * 60_000,

		// This suite reseeds + mutates a shared DB; keep it strictly sequential.
		pool: 'forks',
		maxWorkers: 1,
		fileParallelism: false,
		isolate: true
	}
});
