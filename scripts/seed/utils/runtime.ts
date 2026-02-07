/**
 * Seed runtime controls.
 *
 * Supports deterministic runs with a fixed RNG seed and anchor time.
 */

interface SeedRuntimeOptions {
	deterministic: boolean;
	seed: number;
	anchorDate: Date | null;
}

const DEFAULT_SEED = 20260207;

let runtime: SeedRuntimeOptions = {
	deterministic: false,
	seed: DEFAULT_SEED,
	anchorDate: null
};

let rng = Math.random;

function createMulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function parseAnchorDate(value: string): Date {
	const [year, month, day] = value.split('-').map(Number);
	if (!year || !month || !day) {
		throw new Error(`Invalid anchor date '${value}'. Expected YYYY-MM-DD.`);
	}

	const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`Invalid anchor date '${value}'. Expected YYYY-MM-DD.`);
	}

	return parsed;
}

export function configureSeedRuntime(options: {
	deterministic: boolean;
	seed?: number;
	anchorDate?: string;
}): void {
	const seed = options.seed ?? DEFAULT_SEED;
	const anchorDate = options.anchorDate ? parseAnchorDate(options.anchorDate) : null;

	runtime = {
		deterministic: options.deterministic,
		seed,
		anchorDate
	};

	rng = options.deterministic ? createMulberry32(seed) : Math.random;
}

export function random(): number {
	return rng();
}

export function randomInt(minInclusive: number, maxExclusive: number): number {
	return minInclusive + Math.floor(random() * (maxExclusive - minInclusive));
}

export function getSeedNow(): Date {
	if (runtime.anchorDate) {
		return new Date(runtime.anchorDate);
	}

	return new Date();
}

export function isDeterministicSeedRun(): boolean {
	return runtime.deterministic;
}

export function getSeedValue(): number {
	return runtime.seed;
}

export function getAnchorDateValue(): Date | null {
	return runtime.anchorDate ? new Date(runtime.anchorDate) : null;
}
