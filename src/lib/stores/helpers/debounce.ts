/**
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds have elapsed
 * since the last time the debounced function was invoked. The debounced function comes with a `cancel`
 * method to cancel delayed `func` invocations and a `flush` method to immediately invoke them.
 *
 * @param func The function to debounce.
 * @param wait The number of milliseconds to delay.
 * @returns A new debounced function.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
	func: T,
	wait: number
): ((...args: Parameters<T>) => void) & { cancel: () => void; flush: () => void } {
	let timeout: number | undefined;
	let lastArgs: Parameters<T> | undefined;

	const later = () => {
		timeout = undefined;
		if (lastArgs) {
			func(...lastArgs);
			lastArgs = undefined;
		}
	};

	const debounced = (...args: Parameters<T>) => {
		lastArgs = args;
		clearTimeout(timeout);
		timeout = window.setTimeout(later, wait);
	};

	debounced.cancel = () => {
		clearTimeout(timeout);
		timeout = undefined;
	};

	debounced.flush = () => {
		clearTimeout(timeout);
		later();
	};

	return debounced;
}
