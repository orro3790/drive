#!/usr/bin/env node
/**
 * Takes a screenshot from connected Android device.
 * Saves to device first, then pulls - avoids Windows binary stream corruption.
 *
 * Usage: node scripts/mobile/screenshot.mjs [filename]
 * Default filename: screenshot.png
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const findAdb = () => {
	const localAppData = process.env.LOCALAPPDATA;
	if (localAppData) {
		const sdkPath = join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
		if (existsSync(sdkPath)) return sdkPath;
	}
	const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
	if (androidHome) {
		const sdkPath = join(androidHome, 'platform-tools', 'adb.exe');
		if (existsSync(sdkPath)) return sdkPath;
	}
	return 'adb';
};

const adb = findAdb();
const filename = process.argv[2] || 'screenshot.png';
const outputDir = join(process.cwd(), '.mobile-debug');
const outputPath = join(outputDir, filename);
const devicePath = '/sdcard/claude-screenshot-temp.png';

// Ensure output directory exists
if (!existsSync(outputDir)) {
	mkdirSync(outputDir, { recursive: true });
}

try {
	// Take screenshot on device
	console.log('📸 Taking screenshot...');
	execSync(`"${adb}" shell screencap -p ${devicePath}`, { stdio: 'pipe' });

	// Pull to local machine
	execSync(`"${adb}" pull ${devicePath} "${outputPath}"`, { stdio: 'pipe' });

	// Clean up device
	execSync(`"${adb}" shell rm ${devicePath}`, { stdio: 'pipe' });

	console.log(`✅ Saved: ${outputPath}`);
} catch (error) {
	console.error('❌ Screenshot failed. Is device connected with USB debugging?');
	console.error(error.message);
	process.exit(1);
}
