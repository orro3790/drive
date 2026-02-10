const FOCUSABLE_SELECTOR = [
	'button:not([disabled])',
	'[href]',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
	'[contenteditable="true"]'
].join(',');

type DialogFocusOptions = {
	closeOnEscape?: boolean;
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
	const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

	return nodes.filter((element) => {
		if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') {
			return false;
		}

		if (element.closest('[inert]')) {
			return false;
		}

		if (element.tabIndex < 0) {
			return false;
		}

		return element.getClientRects().length > 0;
	});
}

export function setupDialogFocusTrap(
	container: HTMLElement,
	onClose: () => void,
	{ closeOnEscape = true }: DialogFocusOptions = {}
): () => void {
	const previouslyFocused =
		document.activeElement instanceof HTMLElement ? document.activeElement : null;

	const focusInitialElement = () => {
		const autofocusTarget = container.querySelector<HTMLElement>('[autofocus]');
		if (autofocusTarget && autofocusTarget.getClientRects().length > 0) {
			autofocusTarget.focus();
			return;
		}

		const focusableElements = getFocusableElements(container);
		const fallbackTarget = focusableElements[0] ?? container;
		fallbackTarget.focus();
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (closeOnEscape && event.key === 'Escape') {
			event.preventDefault();
			onClose();
			return;
		}

		if (event.key !== 'Tab') {
			return;
		}

		const focusableElements = getFocusableElements(container);
		if (focusableElements.length === 0) {
			event.preventDefault();
			container.focus();
			return;
		}

		const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const first = focusableElements[0];
		const last = focusableElements[focusableElements.length - 1];

		if (!current || !container.contains(current)) {
			event.preventDefault();
			(event.shiftKey ? last : first).focus();
			return;
		}

		if (event.shiftKey && current === first) {
			event.preventDefault();
			last.focus();
			return;
		}

		if (!event.shiftKey && current === last) {
			event.preventDefault();
			first.focus();
		}
	};

	const rafId = requestAnimationFrame(focusInitialElement);
	document.addEventListener('keydown', handleKeydown);

	return () => {
		cancelAnimationFrame(rafId);
		document.removeEventListener('keydown', handleKeydown);

		if (previouslyFocused?.isConnected) {
			previouslyFocused.focus();
		}
	};
}
