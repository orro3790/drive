import { describe, expect, it } from 'vitest';

import {
	buildSignInRedirect,
	isMonitoredAuthRateLimitPath,
	isPublicRoute
} from '../../src/lib/server/auth-route-policy';

describe('auth route policy', () => {
	it('treats forgot/reset routes as public', () => {
		expect(isPublicRoute('/forgot-password')).toBe(true);
		expect(isPublicRoute('/reset-password')).toBe(true);
	});

	it('keeps app-only routes protected', () => {
		expect(isPublicRoute('/app/settings')).toBe(false);
	});

	it('monitors reset 429s on request-password-reset path', () => {
		expect(isMonitoredAuthRateLimitPath('/api/auth/request-password-reset')).toBe(true);
		expect(isMonitoredAuthRateLimitPath('/api/auth/forget-password')).toBe(false);
	});

	it('builds sign-in redirect with query-preserving target', () => {
		const redirect = buildSignInRedirect('/reset-password', '?token=abc123&foo=bar');
		expect(redirect).toBe('/sign-in?redirect=%2Freset-password%3Ftoken%3Dabc123%26foo%3Dbar');
	});
});
