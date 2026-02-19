import { runNightlyOperationalAlert } from './operational-alert';

runNightlyOperationalAlert().catch((error) => {
	console.error('[nightly-alert] failed:', error);
	process.exit(1);
});
