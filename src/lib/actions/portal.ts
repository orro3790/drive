/**
 * @file src/lib/utils/portal.ts
 * @description A Svelte action to programmatically move a DOM element to the document.body.
 * This is the standard "portal" pattern, essential for UI components like modals,
 * tooltips, and dropdowns that need to escape the CSS stacking context of their parents.
 * By moving the element to the body, it can be positioned freely over any other element
 * on the page without being clipped or trapped.
 */

import type { TooltipPosition, PositionOptions, CalculatedPosition } from '$lib/schemas/tooltip';

/**
 * Calculate the optimal position for a tooltip relative to a trigger element.
 * Automatically adjusts position to keep tooltip within viewport bounds.
 */
export function calculateTooltipPosition(
	tooltipElement: HTMLElement,
	options: PositionOptions
): CalculatedPosition {
	const { position, spacing, triggerElement, fallbackToSide } = options;

	// Get trigger element bounds
	const triggerRect = triggerElement.getBoundingClientRect();
	const tooltipRect = tooltipElement.getBoundingClientRect();

	// Get viewport dimensions
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	let x = 0;
	let y = 0;
	let actualPosition = position;

	// Calculate base position
	switch (position) {
		case 'top':
			x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
			y = triggerRect.top - tooltipRect.height - spacing;

			// Check if tooltip would be clipped at top
			if (y < 0) {
				// Flip to bottom
				actualPosition = 'bottom';
				y = triggerRect.bottom + spacing;
			}
			break;

		case 'bottom':
			x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
			y = triggerRect.bottom + spacing;

			// Check if tooltip would be clipped at bottom
			if (y + tooltipRect.height > viewportHeight) {
				// Flip to top
				actualPosition = 'top';
				y = triggerRect.top - tooltipRect.height - spacing;
			}
			break;

		case 'left':
			x = triggerRect.left - tooltipRect.width - spacing;
			y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;

			// Check if tooltip would be clipped at left
			if (x < 0) {
				// Flip to right
				actualPosition = 'right';
				x = triggerRect.right + spacing;
			}
			break;

		case 'right':
			x = triggerRect.right + spacing;
			y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;

			// Check if tooltip would be clipped at right
			if (x + tooltipRect.width > viewportWidth) {
				// Flip to left
				actualPosition = 'left';
				x = triggerRect.left - tooltipRect.width - spacing;
			}
			break;
	}

	// Ensure tooltip stays within horizontal viewport bounds
	if (actualPosition === 'top' || actualPosition === 'bottom') {
		const idealX = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
		const isCenteringPossible = idealX >= 0 && idealX + tooltipRect.width <= viewportWidth;

		if (isCenteringPossible) {
			x = idealX;
		} else {
			if (fallbackToSide) {
				const rightX = triggerRect.right + spacing;
				const leftX = triggerRect.left - tooltipRect.width - spacing;

				if (rightX + tooltipRect.width <= viewportWidth) {
					actualPosition = 'right';
					x = rightX;
					y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
				} else if (leftX >= 0) {
					actualPosition = 'left';
					x = leftX;
					y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
				} else {
					// Failsafe: clamp if no side fits
					x = Math.max(spacing, Math.min(idealX, viewportWidth - tooltipRect.width - spacing));
				}
			} else {
				// Default behavior without fallback: clamp
				x = Math.max(spacing, Math.min(idealX, viewportWidth - tooltipRect.width - spacing));
			}
		}
	}

	// Ensure tooltip stays within vertical viewport bounds
	if (actualPosition === 'left' || actualPosition === 'right') {
		if (y < 0) {
			y = spacing;
		} else if (y + tooltipRect.height > viewportHeight) {
			y = viewportHeight - tooltipRect.height - spacing;
		}
	}

	return {
		x,
		y,
		actualPosition
	};
}

/**
 * Get arrow offset for positioning the tooltip arrow relative to the trigger element.
 */
export function calculateArrowOffset(
	triggerElement: HTMLElement,
	tooltipElement: HTMLElement,
	position: TooltipPosition
): number {
	const triggerRect = triggerElement.getBoundingClientRect();
	const tooltipRect = tooltipElement.getBoundingClientRect();

	if (position === 'top' || position === 'bottom') {
		// Calculate horizontal offset from tooltip left edge to trigger center
		const triggerCenter = triggerRect.left + triggerRect.width / 2;
		const tooltipLeft = tooltipRect.left;
		return triggerCenter - tooltipLeft;
	} else {
		// Calculate vertical offset from tooltip top edge to trigger center
		const triggerCenter = triggerRect.top + triggerRect.height / 2;
		const tooltipTop = tooltipRect.top;
		return triggerCenter - tooltipTop;
	}
}

/**
 * Svelte action to move a DOM node to `document.body`.
 *
 * @param {HTMLElement} node The element to portal.
 * @returns {{destroy: () => void}} The action object with a destroy method for cleanup.
 */
export function portal(node: HTMLElement) {
	// On mount, append the node to the document body.
	document.body.appendChild(node);

	return {
		/**
		 * On destroy, remove the node from the document body to prevent memory leaks.
		 */
		destroy() {
			if (document.body.contains(node)) {
				document.body.removeChild(node);
			}
		}
	};
}

/**
 * Enhanced portal action with positioning capabilities for tooltips.
 */
export function portalWithPosition(node: HTMLElement, options: PositionOptions) {
	// Move to document body
	document.body.appendChild(node);

	/**
	 * Measure and set the tooltip width to shrink-wrap wrapped content.
	 *
	 * CSS alone cannot shrink an element to the width of its longest wrapped line.
	 * Properties like `width: fit-content`, `display: inline-block`, and `display: table`
	 * all report the element's width as the full `max-width`, even when content wraps
	 * and doesn't fill that width. We must measure line widths programmatically.
	 *
	 * @param contentElement - The .tooltip-content element containing the text
	 * @param node - The .tooltip container element to set width on
	 */
	function setOptimalTooltipWidth(contentElement: HTMLElement, node: HTMLElement): void {
		// Measure each line of wrapped text using Range.getClientRects()
		const range = document.createRange();
		range.selectNodeContents(contentElement);
		const rects = Array.from(range.getClientRects());

		if (rects.length === 0) {
			// No text content to measure, let CSS handle width
			return;
		}

		// Find the widest line
		const maxLineWidth = Math.max(...rects.map((r) => r.width));

		// Get padding and border to calculate total width
		// (these are applied to contentElement, not the parent node)
		const computed = window.getComputedStyle(contentElement);
		const paddingLeft = parseFloat(computed.paddingLeft);
		const paddingRight = parseFloat(computed.paddingRight);
		const borderLeft = parseFloat(computed.borderLeftWidth);
		const borderRight = parseFloat(computed.borderRightWidth);

		// Set the tooltip width to match content (ceil to avoid sub-pixel rendering issues)
		const idealWidth = Math.ceil(
			maxLineWidth + paddingLeft + paddingRight + borderLeft + borderRight
		);
		node.style.width = `${idealWidth}px`;
	}

	// Position the element
	function updatePosition() {
		requestAnimationFrame(() => {
			// Optimize tooltip width to shrink-wrap wrapped content
			const contentElement = node.querySelector('.tooltip-content') as HTMLElement | null;
			if (contentElement) {
				setOptimalTooltipWidth(contentElement, node);
			} else {
				// Defensive: .tooltip-content is required for width optimization
				// If missing, tooltip will use CSS width rules as fallback
			}

			const position = calculateTooltipPosition(node, options);
			node.style.position = 'fixed';
			node.style.left = `${position.x}px`;
			node.style.top = `${position.y}px`;
			node.style.zIndex = 'var(--z-popover)';

			// Store actual position for arrow positioning
			node.dataset.actualPosition = position.actualPosition;

			// Position the arrow
			const arrowElement = node.querySelector('.tooltip-arrow') as HTMLElement;
			if (arrowElement) {
				const offset = calculateArrowOffset(options.triggerElement, node, position.actualPosition);
				if (position.actualPosition === 'top' || position.actualPosition === 'bottom') {
					arrowElement.style.left = `${offset}px`;
				} else {
					arrowElement.style.top = `${offset}px`;
				}
			}

			// Notify parent that positioning is complete
			if (options.onPositioned) {
				options.onPositioned(position);
			}
		});
	}

	// Initial positioning
	updatePosition();

	// Update position on window resize/scroll
	const handleUpdate = () => updatePosition();
	window.addEventListener('resize', handleUpdate);
	window.addEventListener('scroll', handleUpdate, true);

	return {
		update(newOptions: PositionOptions) {
			Object.assign(options, newOptions);
			updatePosition();
		},
		destroy() {
			window.removeEventListener('resize', handleUpdate);
			window.removeEventListener('scroll', handleUpdate, true);
			if (document.body.contains(node)) {
				document.body.removeChild(node);
			}
		}
	};
}
