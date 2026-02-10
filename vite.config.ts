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
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		testTimeout: 20_000,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			include: ['src/lib/stores/routeStore.svelte.ts', 'src/lib/stores/warehouseStore.svelte.ts'],
			thresholds: {
				perFile: true,
				lines: 65,
				functions: 55,
				statements: 65,
				branches: 55
			}
		}
	}
});
