import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const VALID_TASKS = new Set(['assembleDebug', 'assembleRelease', 'bundleRelease']);
const RELEASE_TASKS = new Set(['assembleRelease', 'bundleRelease']);
const REQUIRED_KEYSTORE_FIELDS = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'];
const gradleMaxWorkers = process.env.CAP_GRADLE_MAX_WORKERS?.trim();
const task = process.argv[2] ?? 'bundleRelease';

if (!VALID_TASKS.has(task)) {
	const supported = [...VALID_TASKS].join(', ');
	console.error(`Unsupported Android Gradle task: ${task}`);
	console.error(`Supported tasks: ${supported}`);
	process.exit(1);
}

const fail = (message) => {
	console.error(message);
	process.exit(1);
};

const parseProperties = (content) => {
	const properties = {};

	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
			continue;
		}

		const separatorIndex = trimmed.search(/[:=]/);
		if (separatorIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();

		if (key) {
			properties[key] = value;
		}
	}

	return properties;
};

const isPlaceholderValue = (value) => {
	const normalized = value.toLowerCase();
	return (
		normalized.includes('replace-me') ||
		normalized.includes('changeme') ||
		normalized.includes('your-value') ||
		(value.startsWith('<') && value.endsWith('>'))
	);
};

const runReleasePreflight = () => {
	const serverUrl = process.env.CAP_SERVER_URL?.trim();

	if (!serverUrl) {
		fail(
			'Release build blocked: CAP_SERVER_URL is required. Set an HTTPS runtime URL before running release commands.'
		);
	}

	if (!serverUrl.startsWith('https://')) {
		fail('Release build blocked: CAP_SERVER_URL must start with https:// for release commands.');
	}

	const keystorePropertiesPath = resolve('android', 'keystore.properties');
	if (!existsSync(keystorePropertiesPath)) {
		fail(
			'Release build blocked: android/keystore.properties is missing. Copy android/keystore.properties.example and set local signing values.'
		);
	}

	const properties = parseProperties(readFileSync(keystorePropertiesPath, 'utf8'));

	for (const field of REQUIRED_KEYSTORE_FIELDS) {
		const value = properties[field]?.trim();

		if (!value) {
			fail(`Release build blocked: android/keystore.properties is missing '${field}'.`);
		}

		if (isPlaceholderValue(value)) {
			fail(
				`Release build blocked: android/keystore.properties field '${field}' still contains a placeholder value.`
			);
		}
	}

	const keystoreFilePath = resolve('android', properties.storeFile);
	if (!existsSync(keystoreFilePath)) {
		fail(
			`Release build blocked: configured keystore file does not exist at android/${properties.storeFile}.`
		);
	}
};

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

if (RELEASE_TASKS.has(task)) {
	runReleasePreflight();
}

run('pnpm', ['exec', 'cap', 'sync', 'android']);

const gradleCommand = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
const gradleArgs = [task];

if (gradleMaxWorkers) {
	if (!/^\d+$/.test(gradleMaxWorkers) || Number(gradleMaxWorkers) < 1) {
		fail(
			'Invalid CAP_GRADLE_MAX_WORKERS value. Use a positive integer (for example: CAP_GRADLE_MAX_WORKERS=1).'
		);
	}

	gradleArgs.push(`--max-workers=${gradleMaxWorkers}`);
}

run(gradleCommand, gradleArgs, { cwd: 'android' });
