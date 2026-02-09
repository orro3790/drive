import { spawnSync } from 'node:child_process';
import process from 'node:process';

const VALID_TASKS = new Set(['assembleDebug', 'assembleRelease', 'bundleRelease']);
const task = process.argv[2] ?? 'bundleRelease';

if (!VALID_TASKS.has(task)) {
	const supported = [...VALID_TASKS].join(', ');
	console.error(`Unsupported Android Gradle task: ${task}`);
	console.error(`Supported tasks: ${supported}`);
	process.exit(1);
}

const run = (command, args, options = {}) => {
	const result = spawnSync(command, args, {
		stdio: 'inherit',
		shell: process.platform === 'win32',
		...options
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
};

run('pnpm', ['exec', 'cap', 'sync', 'android']);

const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradleCommand, [task], { cwd: 'android' });
