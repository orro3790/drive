/**
 * Breadcrumb type for PageHeader navigation.
 */
export interface Breadcrumb {
	label: string;
	onSelect?: () => void;
	onBack?: () => void;
}
