/**
 * @file src/lib/schemas/tooltip.ts
 * @description Types for tooltip positioning used by portal actions and Tooltip component.
 */

/** Valid positions for tooltip placement relative to trigger element */
export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

/** Options for positioning a tooltip via the portalWithPosition action */
export interface PositionOptions {
	/** Preferred position relative to trigger */
	position: TooltipPosition;
	/** Spacing in pixels between tooltip and trigger */
	spacing: number;
	/** The DOM element that triggers the tooltip */
	triggerElement: HTMLElement;
	/** Whether to fallback to side positions when top/bottom would clip */
	fallbackToSide?: boolean;
	/** Callback fired after tooltip is positioned */
	onPositioned?: (position: CalculatedPosition) => void;
}

/** Result of tooltip position calculation */
export interface CalculatedPosition {
	/** X coordinate in pixels */
	x: number;
	/** Y coordinate in pixels */
	y: number;
	/** Actual position after viewport adjustments (may differ from requested) */
	actualPosition: TooltipPosition;
}
