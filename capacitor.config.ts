import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
	appId: 'com.orro.drive',
	appName: 'Drive',
	webDir: 'mobile-shell',
	bundledWebRuntime: false
};

if (serverUrl) {
	config.server = {
		url: serverUrl,
		cleartext: serverUrl.startsWith('http://')
	};
}

export default config;
