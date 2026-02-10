type RuntimeEnv = Record<string, string | undefined>;

type DeploymentEnvironment = 'development' | 'preview' | 'production';

export interface TrustedOriginsResolution {
	origins: string[];
	invalidEntries: string[];
	deploymentEnvironment: DeploymentEnvironment;
}

function parseOriginList(value: string | undefined): string[] {
	if (!value) {
		return [];
	}

	return value
		.split(/[\n,;]+/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function normalizeTrustedOrigin(candidate: string, allowWildcard: boolean): string {
	if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
		throw new Error('origin must start with http:// or https://');
	}

	if (candidate.includes('*')) {
		if (!allowWildcard) {
			throw new Error('wildcard origins are only allowed in development');
		}

		return candidate.replace(/\/+$/, '');
	}

	return new URL(candidate).origin;
}

function resolveDeploymentEnvironment(runtimeEnv: RuntimeEnv): DeploymentEnvironment {
	const vercelEnv = runtimeEnv.VERCEL_ENV?.trim().toLowerCase();

	if (vercelEnv === 'preview') {
		return 'preview';
	}

	if (vercelEnv === 'production') {
		return 'production';
	}

	if (runtimeEnv.NODE_ENV === 'production') {
		return 'production';
	}

	return 'development';
}

export function resolveTrustedOrigins(runtimeEnv: RuntimeEnv): TrustedOriginsResolution {
	const deploymentEnvironment = resolveDeploymentEnvironment(runtimeEnv);
	const origins = new Set<string>();
	const invalidEntries: string[] = [];

	const addOrigin = (value: string | undefined, allowWildcard: boolean) => {
		if (!value) {
			return;
		}

		const candidate = value.trim();
		if (!candidate) {
			return;
		}

		try {
			origins.add(normalizeTrustedOrigin(candidate, allowWildcard));
		} catch {
			invalidEntries.push(candidate);
		}
	};

	if (deploymentEnvironment === 'development') {
		origins.add('http://localhost:5173');
		origins.add('http://127.0.0.1:5173');
	}

	if (runtimeEnv.BETTER_AUTH_URL) {
		addOrigin(runtimeEnv.BETTER_AUTH_URL, false);
	}

	if (runtimeEnv.VERCEL_URL) {
		addOrigin(`https://${runtimeEnv.VERCEL_URL}`, false);
	}

	if (runtimeEnv.VERCEL_PROJECT_PRODUCTION_URL) {
		addOrigin(`https://${runtimeEnv.VERCEL_PROJECT_PRODUCTION_URL}`, false);
	}

	const sharedOverrides = parseOriginList(runtimeEnv.BETTER_AUTH_TRUSTED_ORIGINS);
	for (const entry of sharedOverrides) {
		addOrigin(entry, deploymentEnvironment === 'development');
	}

	if (deploymentEnvironment === 'development') {
		const devOverrides = parseOriginList(runtimeEnv.BETTER_AUTH_DEV_TRUSTED_ORIGINS);
		for (const entry of devOverrides) {
			addOrigin(entry, true);
		}
	}

	return {
		origins: [...origins],
		invalidEntries,
		deploymentEnvironment
	};
}
