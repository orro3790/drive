import { describe, expect, it } from 'vitest';

import { resolveTrustedOrigins } from '../../src/lib/server/auth-trusted-origins';

describe('auth trusted origins resolver', () => {
	it('uses localhost defaults in development', () => {
		const result = resolveTrustedOrigins({ NODE_ENV: 'development' });

		expect(result.deploymentEnvironment).toBe('development');
		expect(result.invalidEntries).toEqual([]);
		expect(result.origins).toContain('http://localhost:5173');
		expect(result.origins).toContain('http://127.0.0.1:5173');
	});

	it('allows wildcard dev overrides only in development', () => {
		const result = resolveTrustedOrigins({
			NODE_ENV: 'development',
			BETTER_AUTH_DEV_TRUSTED_ORIGINS: 'http://192.168.*'
		});

		expect(result.invalidEntries).toEqual([]);
		expect(result.origins).toContain('http://192.168.*');
	});

	it('uses explicit preview deployment origin and rejects wildcard shared overrides', () => {
		const result = resolveTrustedOrigins({
			NODE_ENV: 'production',
			VERCEL_ENV: 'preview',
			VERCEL_URL: 'drive-git-bead-preview.vercel.app',
			BETTER_AUTH_TRUSTED_ORIGINS: 'https://*.vercel.app'
		});

		expect(result.deploymentEnvironment).toBe('preview');
		expect(result.origins).toContain('https://drive-git-bead-preview.vercel.app');
		expect(result.invalidEntries).toContain('https://*.vercel.app');
	});

	it('collects explicit production origins and marks wildcard overrides invalid', () => {
		const result = resolveTrustedOrigins({
			NODE_ENV: 'production',
			VERCEL_ENV: 'production',
			BETTER_AUTH_URL: 'https://drive.example.com/auth',
			VERCEL_PROJECT_PRODUCTION_URL: 'drive.example.com',
			BETTER_AUTH_TRUSTED_ORIGINS: 'https://*.vercel.app,https://admin.example.com'
		});

		expect(result.deploymentEnvironment).toBe('production');
		expect(result.origins).toContain('https://drive.example.com');
		expect(result.origins).toContain('https://admin.example.com');
		expect(result.invalidEntries).toContain('https://*.vercel.app');
	});
});
