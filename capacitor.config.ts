import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
	appId: 'com.orro.drive',
	appName: 'Drive',
	webDir: 'mobile-shell',
	bundledWebRuntime: false
};

if (serverUrl?.trim()) {
	const normalizedServerUrl = serverUrl.trim();

	config.server = {
		url: normalizedServerUrl,
		cleartext: normalizedServerUrl.startsWith('http://')
	};
}

export default config;
