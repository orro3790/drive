#!/usr/bin/env node
/**
 * Mobile development server with ADB port forwarding.
 * Automatically finds ADB in the Android SDK.
 */

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const findAdb = () => {
	// Check common Android SDK locations on Windows
	const localAppData = process.env.LOCALAPPDATA;
	if (localAppData) {
		const sdkPath = join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
		if (existsSync(sdkPath)) return sdkPath;
	}

	// Check ANDROID_HOME or ANDROID_SDK_ROOT
	const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
	if (androidHome) {
		const sdkPath = join(androidHome, 'platform-tools', 'adb.exe');
		if (existsSync(sdkPath)) return sdkPath;
	}

	// Fallback to PATH
	return 'adb';
};

const adb = findAdb();
console.log(`📱 Using ADB: ${adb}`);

// Set up port forwarding
try {
	console.log('🔗 Setting up ADB reverse port forwarding...');
	execSync(`"${adb}" reverse tcp:5173 tcp:5173`, { stdio: 'inherit' });
	console.log('✅ Port 5173 forwarded to device\n');
} catch (error) {
	console.error(
		'❌ Failed to set up ADB reverse. Is your phone connected with USB debugging enabled?'
	);
	process.exit(1);
}

// Start vite dev server
console.log('🚀 Starting dev server...\n');
const vite = spawn('pnpm', ['exec', 'vite', 'dev', '--host'], {
	stdio: 'inherit',
	shell: true
});

vite.on('close', (code) => {
	process.exit(code ?? 0);
});
