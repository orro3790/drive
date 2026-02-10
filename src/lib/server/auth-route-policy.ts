const PUBLIC_PATHS = new Set(['/', '/sign-in', '/sign-up', '/forgot-password', '/reset-password']);

const PUBLIC_PREFIXES = ['/api/auth', '/api/cron', '/_app', '/static'];

const MONITORED_AUTH_RATE_LIMIT_PREFIXES = [
	'/api/auth/sign-up',
	'/api/auth/sign-in',
	'/api/auth/request-password-reset'
];

export function isPublicRoute(pathname: string): boolean {
	return (
		PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
	);
}

export function isMonitoredAuthRateLimitPath(pathname: string): boolean {
	return MONITORED_AUTH_RATE_LIMIT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function buildSignInRedirect(pathname: string, search: string): string {
	const redirectTarget = `${pathname}${search || ''}`;
	return `/sign-in?redirect=${encodeURIComponent(redirectTarget)}`;
}
