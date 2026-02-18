#!/usr/bin/env node
/**
 * Capacitor sync wrapper that loads .env and validates CAP_SERVER_URL for production builds.
 *
 * Usage:
 *   node scripts/mobile/cap-sync.mjs dev   - Syncs with localhost for emulator
 *   node scripts/mobile/cap-sync.mjs prod  - Syncs with CAP_SERVER_URL from .env
 *   node scripts/mobile/cap-sync.mjs       - Syncs without server URL (shell fallback)
 */

import 'dotenv/config';
import { execSync } from 'child_process';

const mode = process.argv[2];

if (mode === 'dev') {
	// Android emulator uses 10.0.2.2 to reach host localhost
	process.env.CAP_SERVER_URL = 'http://10.0.2.2:5173';
	console.log('📱 Dev mode: Syncing with http://10.0.2.2:5173 (host localhost)');
} else if (mode === 'prod') {
	const url = process.env.CAP_SERVER_URL;
	if (!url) {
		console.error('❌ Error: CAP_SERVER_URL not set in .env');
		console.error('   Set it to your production URL (e.g., https://drive.vercel.app)');
		process.exit(1);
	}
	if (!url.startsWith('https://')) {
		console.error('❌ Error: Production CAP_SERVER_URL must use HTTPS');
		process.exit(1);
	}
	console.log(`🚀 Prod mode: Syncing with ${url}`);
} else if (mode) {
	console.error(`❌ Unknown mode: ${mode}`);
	console.error('   Usage: cap-sync.mjs [dev|prod]');
	process.exit(1);
} else if (process.env.CAP_SERVER_URL) {
	// CAP_SERVER_URL passed via environment (e.g., USB dev mode)
	console.log(`📱 USB mode: Syncing with ${process.env.CAP_SERVER_URL}`);
} else {
	// No mode and no URL = clear server URL (use bundled shell)
	delete process.env.CAP_SERVER_URL;
	console.log('📦 Shell mode: Syncing without server URL (uses mobile-shell fallback)');
}

try {
	execSync('pnpm exec cap sync android', { stdio: 'inherit' });
} catch {
	process.exit(1);
}
