import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? '4173');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		serviceWorkers: 'block'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: `pnpm dev --host 127.0.0.1 --port ${port}`,
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: {
			BETTER_AUTH_URL: baseURL,
			BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'test-better-auth-secret',
			CRON_SECRET: process.env.CRON_SECRET ?? 'test-cron-secret',
			FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? 'test-project',
			FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ?? 'test@example.com',
			FIREBASE_PRIVATE_KEY:
				process.env.FIREBASE_PRIVATE_KEY ??
				'-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n',
			DATABASE_URL: process.env.DATABASE_URL ?? ''
		}
	}
});
