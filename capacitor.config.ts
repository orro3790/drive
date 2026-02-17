import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
	appId: 'com.orro.drive',
	appName: 'Drive',
	webDir: 'mobile-shell',
	plugins: {
		// SystemBars handles edge-to-edge layouts.
		// 'css' injects --safe-area-inset-* CSS variables.
		// Default to dark-mode-friendly system bar content at launch.
		SystemBars: {
			insetsHandling: 'css',
			style: 'DEFAULT'
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
