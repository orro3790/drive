/**
 * @file src/lib/schemas/ui/select.ts
 * @description Zod schema and inferred type for select options used by shared UI components.
 */
import { z } from 'zod';

export const selectOptionSchema = z.object({
	value: z.union([z.string(), z.number()]),
	label: z.string(),
	iconSrc: z.url().optional(),
	iconAlt: z.string().optional(),
	meta: z.unknown().optional()
});

export type SelectOption = z.infer<typeof selectOptionSchema>;

/**
 * Size prop schema for Select and Combobox components
 * Provides runtime validation of size values
 */
export const selectSizeSchema = z.enum(['xs', 'sm', 'xl']);

export type SelectSize = z.infer<typeof selectSizeSchema>;
