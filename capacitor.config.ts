import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
	appId: 'com.orro.drive',
	appName: 'Drive',
	webDir: 'mobile-shell',
	plugins: {
		// SystemBars is bundled with @capacitor/core.
		// On Android, it can inject CSS vars (--safe-area-inset-*) to work around
		// WebView safe-area env() bugs for edge-to-edge layouts.
		SystemBars: {
			insetsHandling: 'css'
		}
	}
};

if (serverUrl?.trim()) {
	const normalizedServerUrl = serverUrl.trim();

	config.server = {
		url: normalizedServerUrl,
		cleartext: normalizedServerUrl.startsWith('http://')
	};
}

export default config;
