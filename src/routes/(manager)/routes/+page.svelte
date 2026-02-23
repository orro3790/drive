<!--
	Route Management Page (Manager Dashboard)

	Manager's main dashboard showing:
	- Route coverage status with assignment details
	- CRUD operations on routes
	- Bid windows tab with polling-based refresh
	- Row click shows details in side panel

	Uses DataTable with Drive tabs/toolbar pattern.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import {
		DataTable,
		createSvelteTable,
		getCoreRowModel,
		getSortedRowModel,
		getPaginationRowModel,
		createColumnHelper,
		type SortingState,
		type PaginationState,
		type CellRendererContext
	} from '$lib/components/data-table';
	import PageWithDetailPanel from '$lib/components/PageWithDetailPanel.svelte';
	import BidWindowsTable from '$lib/components/BidWindowsTable.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import Select from '$lib/components/Select.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
	import Drawer from '$lib/components/primitives/Drawer.svelte';
	import Toggle from '$lib/components/primitives/Toggle.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';
	import Filter from '$lib/components/icons/Filter.svelte';
	import Reset from '$lib/components/icons/Reset.svelte';
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import Trash from '$lib/components/icons/Trash.svelte';
	import AlertCircleIcon from '$lib/components/icons/AlertCircleIcon.svelte';
	import { routeStore, type RouteWithWarehouse } from '$lib/stores/routeStore.svelte';
	import { warehouseStore } from '$lib/stores/warehouseStore.svelte';
	import { bidWindowStore, type BidWindow } from '$lib/stores/bidWindowStore.svelte';
	import { driverStore } from '$lib/stores/driverStore.svelte';
	import {
		routeCreateSchema,
		routeUpdateSchema,
		type RouteStatus,
		type ShiftProgress
	} from '$lib/schemas/route';
	import type { SelectOption } from '$lib/schemas/ui/select';
	import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
	import { debounce } from '$lib/stores/helpers/debounce';

	// Tab state
	type TabId = 'routes' | 'unfilled' | 'bidWindows';
	type RouteBidOverrideAction = 'open_bidding' | 'open_urgent_bidding';
	type RouteSuspendAction = 'suspend_route' | 'resume_route';
	type RouteOverrideAction = RouteBidOverrideAction | RouteSuspendAction;
	let activeTab = $state<TabId>('routes');

	// State
	let showCreateModal = $state(false);
	let deleteConfirm = $state<{ route: RouteWithWarehouse; x: number; y: number } | null>(null);
	let showFilterDrawer = $state(false);
	let selectedRouteId = $state<string | null>(null);
	let selectedBidWindowId = $state<string | null>(null);
	let isEditing = $state(false);

	// Form state
	let formName = $state('');
	let formStartTime = $state('09:00');
	let formWarehouseId = $state('');
	let formErrors = $state<{ name?: string[]; warehouseId?: string[]; startTime?: string[] }>({});
	let showRouteAssignModal = $state(false);
	let routeAssignTarget = $state<RouteWithWarehouse | null>(null);
	let routeAssignDriverId = $state('');
	let routeAssignErrors = $state<{ driverId?: string[] }>({});
	let showAssignModal = $state(false);
	let assignTargetWindow = $state<BidWindow | null>(null);
	let assignDriverId = $state('');
	let assignErrors = $state<{ driverId?: string[] }>({});
	let closeConfirmWindow = $state<BidWindow | null>(null);
	let overrideConfirm = $state<{
		route: RouteWithWarehouse;
		action: RouteOverrideAction;
		x: number;
		y: number;
	} | null>(null);
	let urgentBonusPercent = $state(20);
	let managerStream: EventSource | null = null;

	// Filter state
	let warehouseFilter = $state('');
	let statusFilter = $state<RouteStatus | ''>('');
	let dateFilter = $state(toLocalYmd());
	let progressFilter = $state<string | null>(null);

	// Table state
	let sorting = $state<SortingState>([]);
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 20 });
	let hasLoadedRoutes = $state(false);
	const routesTableLoading = $derived(!hasLoadedRoutes || routeStore.isLoading);

	function isUnfilledRoute(route: RouteWithWarehouse): boolean {
		return route.status === 'unfilled' || route.status === 'bidding';
	}

	const filteredRoutes = $derived.by(() => {
		const tabFilteredRoutes =
			activeTab === 'unfilled' ? routeStore.routes.filter(isUnfilledRoute) : routeStore.routes;

		if (!progressFilter) return tabFilteredRoutes;
		switch (progressFilter) {
			case 'not_arrived':
				return tabFilteredRoutes.filter((r) => r.shiftProgress === 'no_show');
			case 'unfilled':
				return tabFilteredRoutes.filter(isUnfilledRoute);
			case 'in_progress':
				return tabFilteredRoutes.filter(
					(r) => r.shiftProgress === 'arrived' || r.shiftProgress === 'started'
				);
			default:
				return tabFilteredRoutes.filter((r) => r.shiftProgress === progressFilter);
		}
	});

	const unfilledRouteCount = $derived(routeStore.routes.filter(isUnfilledRoute).length);
	const requestedTab = $derived.by(() => {
		switch ($page.url.searchParams.get('tab')) {
			case 'routes':
			case 'unfilled':
			case 'bidWindows':
				return $page.url.searchParams.get('tab') as TabId;
			default:
				return null;
		}
	});

	const helper = createColumnHelper<RouteWithWarehouse>();

	const columns = [
		helper.text('name', {
			header: m.common_name(),
			sortable: true,
			sizing: 'fixed',
			width: 280,
			minWidth: 200,
			stickyLeft: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.text('warehouseName', {
			header: m.route_warehouse_header(),
			sortable: true,
			sizing: 'fixed',
			width: 220,
			minWidth: 180,
			mobileVisible: true,
			mobilePriority: 2
		}),
		helper.text('startTime', {
			header: m.route_start_time_header(),
			sortable: true,
			sizing: 'fixed',
			width: 120,
			minWidth: 96,
			mobileVisible: true,
			mobilePriority: 3
		}),
		helper.accessor(
			'driver',
			(row) => {
				if (row.driverName) {
					return `assigned:${row.driverName.toLowerCase()}`;
				}

				if (row.bidWindowClosesAt) {
					return `bidding:${row.bidWindowClosesAt}`;
				}

				return `unassigned:${row.name.toLowerCase()}`;
			},
			{
				header: m.manager_dashboard_driver_header(),
				sortable: true,
				sizing: 'fixed',
				width: 220
			}
		),
		helper.accessor(
			'status',
			(row) => {
				if (row.shiftProgress) {
					const shiftProgressSortOrder: Record<ShiftProgress, number> = {
						unconfirmed: 1,
						confirmed: 2,
						arrived: 3,
						started: 4,
						completed: 5,
						no_show: 6,
						cancelled: 7
					};

					return shiftProgressSortOrder[row.shiftProgress];
				}

				const statusSortOrder: Record<RouteStatus, number> = {
					assigned: 20,
					bidding: 21,
					unfilled: 22,
					suspended: 23
				};

				return statusSortOrder[row.status];
			},
			{
				header: m.route_status_header(),
				sortable: true,
				sizing: 'fixed',
				width: 160
			}
		)
	];

	const table = createSvelteTable<RouteWithWarehouse>(() => ({
		data: filteredRoutes,
		columns,
		getRowId: (row) => row.id,
		state: {
			sorting,
			pagination
		},
		enableColumnResizing: true,
		columnResizeMode: 'onChange',
		onSortingChange: (updater) => {
			sorting = typeof updater === 'function' ? updater(sorting) : updater;
		},
		onPaginationChange: (updater) => {
			pagination = typeof updater === 'function' ? updater(pagination) : updater;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	}));

	const statusLabels: Record<RouteStatus, string> = {
		assigned: m.route_status_assigned(),
		unfilled: m.route_status_unfilled(),
		bidding: m.route_status_bidding(),
		suspended: m.route_status_suspended()
	};

	const statusChip: Record<RouteStatus, 'success' | 'error' | 'info' | 'warning' | 'neutral'> = {
		assigned: 'neutral',
		unfilled: 'error',
		bidding: 'neutral',
		suspended: 'neutral'
	};

	const progressLabels: Record<ShiftProgress, string> = {
		unconfirmed: m.route_progress_unconfirmed(),
		confirmed: m.route_progress_confirmed(),
		arrived: m.route_progress_arrived(),
		started: m.route_progress_started(),
		completed: m.route_progress_completed(),
		no_show: m.route_progress_no_show(),
		cancelled: m.route_progress_cancelled()
	};

	const progressChip: Record<ShiftProgress, 'warning' | 'neutral' | 'info' | 'success' | 'error'> =
		{
			unconfirmed: 'warning',
			confirmed: 'neutral',
			arrived: 'neutral',
			started: 'neutral',
			completed: 'neutral',
			no_show: 'error',
			cancelled: 'neutral'
		};

	const progressFilterOptions: SelectOption[] = [
		{ value: '', label: m.route_filter_progress_all() },
		{ value: 'unconfirmed', label: m.route_progress_unconfirmed() },
		{ value: 'confirmed', label: m.route_progress_confirmed() },
		{ value: 'arrived', label: m.route_progress_arrived() },
		{ value: 'in_progress', label: m.route_progress_started() },
		{ value: 'completed', label: m.route_progress_completed() },
		{ value: 'not_arrived', label: m.manager_attention_not_arrived() },
		{ value: 'cancelled', label: m.route_progress_cancelled() },
		{ value: 'unfilled', label: m.manager_attention_unfilled() }
	];

	const statusOptions: SelectOption[] = [
		{ value: '', label: m.route_filter_status_all() },
		{ value: 'assigned', label: statusLabels.assigned },
		{ value: 'unfilled', label: statusLabels.unfilled },
		{ value: 'bidding', label: statusLabels.bidding },
		{ value: 'suspended', label: statusLabels.suspended }
	];

	const progressFilterSelectValue = $derived(progressFilter ?? '');

	function clearProgressFilter() {
		progressFilter = null;
	}

	function toLocalYmd(date = new Date()) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function applyFilters() {
		return routeStore.load({
			warehouseId: warehouseFilter || undefined,
			status: statusFilter || undefined,
			date: dateFilter || undefined
		});
	}

	function resetFilters() {
		warehouseFilter = '';
		statusFilter = '';
		dateFilter = toLocalYmd();
		progressFilter = null;
		applyFilters();
	}

	function clearDateFilter() {
		dateFilter = toLocalYmd();
		applyFilters();
	}

	function clearWarehouseFilter() {
		warehouseFilter = '';
		applyFilters();
	}

	function clearStatusFilter() {
		statusFilter = '';
		applyFilters();
	}

	function formatDate(dateStr: string) {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatDateChipLabel(dateStr: string): string {
		if (!dateStr) return m.common_today();
		const today = toLocalYmd();
		if (dateStr === today) return m.common_today();
		const [y, mo, d] = dateStr.split('-').map(Number);
		const date = new Date(y, mo - 1, d);
		const nowYear = new Date().getFullYear();
		if (y !== nowYear) {
			return date.toLocaleDateString(getLocale(), {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		}
		return date.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
	}

	function formatTimestamp(isoString: string): string {
		const date = new Date(isoString);
		return date.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'America/Toronto'
		});
	}

	function formatBidWindowLabel(isoString: string) {
		const date = new Date(isoString);
		const now = new Date();
		const diffMs = date.getTime() - now.getTime();
		const diffMins = Math.round(diffMs / 60000);

		if (diffMins < 0) return m.manager_dashboard_bid_closed();

		if (diffMins < 60) {
			return m.bid_windows_countdown_minutes({ count: diffMins });
		} else {
			const diffHours = Math.round(diffMins / 60);
			if (diffHours < 24) {
				return m.bid_windows_countdown_hours({ count: diffHours });
			} else {
				const diffDays = Math.round(diffHours / 24);
				return m.bid_windows_countdown_days({ count: diffDays });
			}
		}
	}

	function syncSelectedRoute(route: RouteWithWarehouse) {
		if (selectedRouteId === route.id) return;
		selectedRouteId = route.id;
		formName = route.name;
		formStartTime = route.startTime;
		formWarehouseId = route.warehouseId;
		formErrors = {};
		isEditing = false;
	}

	function clearSelection() {
		selectedRouteId = null;
		formErrors = {};
		isEditing = false;
	}

	function handleRowClick(route: RouteWithWarehouse, _event: MouseEvent) {
		syncSelectedRoute(route);
	}

	function openCreateModal() {
		formName = '';
		formStartTime = '09:00';
		formWarehouseId = '';
		formErrors = {};
		showCreateModal = true;
	}

	function startEditing(route: RouteWithWarehouse) {
		if (selectedRouteId !== route.id) {
			selectedRouteId = route.id;
		}
		formName = route.name;
		formStartTime = route.startTime;
		formWarehouseId = route.warehouseId;
		formErrors = {};
		isEditing = true;
	}

	function cancelEditing() {
		if (selectedRoute) {
			formName = selectedRoute.name;
			formStartTime = selectedRoute.startTime;
			formWarehouseId = selectedRoute.warehouseId;
		}
		formErrors = {};
		isEditing = false;
	}

	function handleEditToggle(editing: boolean) {
		if (!selectedRoute) return;
		if (editing) {
			startEditing(selectedRoute);
			return;
		}
		cancelEditing();
	}

	function closeModals() {
		showCreateModal = false;
		formErrors = {};
	}

	function handleCreate() {
		const result = routeCreateSchema.safeParse({
			name: formName,
			startTime: formStartTime,
			warehouseId: formWarehouseId
		});
		if (!result.success) {
			formErrors = result.error.flatten().fieldErrors;
			return;
		}

		const warehouseName =
			warehouseStore.warehouses.find((warehouse) => warehouse.id === result.data.warehouseId)
				?.name ?? '';
		routeStore.create(result.data, warehouseName);
		closeModals();
	}

	function handleSave() {
		if (!selectedRoute) return;

		const result = routeUpdateSchema.safeParse({
			name: formName,
			startTime: formStartTime,
			warehouseId: formWarehouseId
		});
		if (!result.success) {
			formErrors = result.error.flatten().fieldErrors;
			return;
		}

		const warehouseName =
			warehouseStore.warehouses.find((warehouse) => warehouse.id === result.data.warehouseId)
				?.name ?? selectedRoute.warehouseName;
		routeStore.update(selectedRoute.id, result.data, warehouseName);
		formErrors = {};
		isEditing = false;
	}

	function openDeleteConfirm(route: RouteWithWarehouse, event: MouseEvent) {
		deleteConfirm = {
			route,
			x: event.clientX,
			y: event.clientY
		};
	}

	function handleDelete() {
		if (!deleteConfirm) return;
		routeStore.delete(deleteConfirm.route.id);
		deleteConfirm = null;
	}

	const warehouseOptions = $derived(
		warehouseStore.warehouses.map((warehouse) => ({
			value: warehouse.id,
			label: warehouse.name
		}))
	);

	const warehouseFilterOptions = $derived([
		{ value: '', label: m.route_filter_warehouse_all() },
		...warehouseOptions
	]);

	const warehouseChipLabel = $derived(
		warehouseFilter
			? (warehouseStore.warehouses.find((w) => w.id === warehouseFilter)?.name ?? '')
			: ''
	);

	const warehouseFormOptions = $derived(warehouseOptions);

	const driverOptions = $derived(
		driverStore.drivers.map((driver) => ({
			value: driver.id,
			label: driver.name
		}))
	);

	const selectedRoute = $derived.by(
		() => routeStore.routes.find((route) => route.id === selectedRouteId) ?? null
	);
	const hasChanges = $derived(
		!!selectedRoute &&
			(formName !== selectedRoute.name ||
				formStartTime !== selectedRoute.startTime ||
				formWarehouseId !== selectedRoute.warehouseId)
	);

	// Tab switching logic
	function switchTab(tab: TabId) {
		if (tab === activeTab) return;
		const wasRouteTab = activeTab !== 'bidWindows';
		const isRouteTab = tab !== 'bidWindows';

		// Clear selections when switching
		if (wasRouteTab && !isRouteTab) {
			clearSelection();
		}

		if (!wasRouteTab && isRouteTab) {
			clearBidWindowSelection();
		}

		if (tab === 'unfilled' && selectedRoute && !isUnfilledRoute(selectedRoute)) {
			clearSelection();
		}

		// Stop/start polling based on tab
		if (tab === 'bidWindows') {
			bidWindowStore.startPolling(30000);
		} else {
			bidWindowStore.stopPolling();
		}

		activeTab = tab;
	}

	$effect(() => {
		if (!requestedTab) {
			return;
		}

		if (requestedTab !== activeTab) {
			switchTab(requestedTab);
		}

		const nextParams = new URLSearchParams($page.url.searchParams);
		nextParams.delete('tab');
		const query = nextParams.toString();
		const target = query ? `${$page.url.pathname}?${query}` : $page.url.pathname;
		void goto(target, { replaceState: true, noScroll: true, keepFocus: true });
	});

	// Bid window selection
	function syncSelectedBidWindow(window: BidWindow) {
		if (selectedBidWindowId === window.id) return;
		selectedBidWindowId = window.id;
	}

	function clearBidWindowSelection() {
		selectedBidWindowId = null;
	}

	function handleBidWindowRowClick(window: BidWindow, _event: MouseEvent) {
		syncSelectedBidWindow(window);
	}

	const selectedBidWindow = $derived.by(
		() => bidWindowStore.bidWindows.find((w) => w.id === selectedBidWindowId) ?? null
	);

	const refreshRoutes = debounce(() => {
		routeStore.load(routeStore.filters);
	}, 200);

	const refreshBidWindows = debounce(() => {
		bidWindowStore.load(bidWindowStore.filters);
	}, 200);

	const refreshDrivers = debounce(() => {
		driverStore.load();
	}, 200);

	function handleAssignmentUpdate() {
		refreshRoutes();
	}

	function handleBidWindowUpdate() {
		refreshRoutes();
		if (activeTab === 'bidWindows') {
			refreshBidWindows();
		}
	}

	function handleDriverFlagged() {
		if (driverStore.drivers.length > 0) {
			refreshDrivers();
		}
	}

	function startRealtime() {
		managerStream = new EventSource('/api/sse/manager');
		managerStream.addEventListener('assignment:updated', handleAssignmentUpdate);
		managerStream.addEventListener('bid_window:opened', handleBidWindowUpdate);
		managerStream.addEventListener('bid_window:closed', handleBidWindowUpdate);
		managerStream.addEventListener('driver:flagged', handleDriverFlagged);
	}

	function canManualAssign(window: BidWindow) {
		return window.status === 'open' || !window.winnerName;
	}

	function canManualAssignRoute(route: RouteWithWarehouse) {
		if (!route.assignmentId) return false;
		return route.assignmentStatus === 'scheduled' || route.assignmentStatus === 'unfilled';
	}

	function isRouteAssigning(route: RouteWithWarehouse) {
		return route.assignmentId ? routeStore.isAssigningAssignment(route.assignmentId) : false;
	}

	function isRouteOverriding(route: RouteWithWarehouse) {
		return route.assignmentId ? routeStore.isOverridingAssignment(route.assignmentId) : false;
	}

	function getRouteBidOverrideAction(route: RouteWithWarehouse): RouteBidOverrideAction | null {
		if (!route.assignmentId || !route.assignmentStatus) {
			return null;
		}

		if (route.assignmentStatus === 'scheduled') {
			return 'open_urgent_bidding';
		}

		if (route.assignmentStatus !== 'unfilled') {
			return null;
		}

		if (route.status === 'bidding') {
			return 'open_urgent_bidding';
		}

		return route.isShiftStarted ? 'open_urgent_bidding' : 'open_bidding';
	}

	function getRouteSuspendAction(route: RouteWithWarehouse): RouteSuspendAction | null {
		if (!route.assignmentId || !route.assignmentStatus) {
			return null;
		}

		if (route.assignmentStatus === 'cancelled' && route.status === 'suspended') {
			return 'resume_route';
		}

		if (route.assignmentStatus === 'scheduled' || route.assignmentStatus === 'unfilled') {
			return 'suspend_route';
		}

		return null;
	}

	function getOverrideActionLabel(action: RouteOverrideAction): string {
		if (action === 'open_bidding') {
			return m.manager_override_open_bidding_button();
		}

		if (action === 'open_urgent_bidding') {
			return m.manager_override_open_urgent_bidding_button();
		}

		return action === 'suspend_route'
			? m.manager_override_suspend_route_button()
			: m.manager_override_resume_route_button();
	}

	function getOverrideConfirmTitle(action: RouteOverrideAction): string {
		if (action === 'open_bidding') {
			return m.manager_override_open_bidding_title();
		}

		if (action === 'open_urgent_bidding') {
			return m.manager_override_open_urgent_bidding_title();
		}

		return action === 'suspend_route'
			? m.manager_override_suspend_route_title()
			: m.manager_override_resume_route_title();
	}

	function getOverrideConfirmDescription(confirm: {
		route: RouteWithWarehouse;
		action: RouteOverrideAction;
	}): string {
		if (confirm.action === 'open_bidding') {
			return m.manager_override_open_bidding_description({ routeName: confirm.route.name });
		}

		if (confirm.action === 'suspend_route') {
			if (confirm.route.driverName) {
				return m.manager_override_suspend_route_description_assigned({
					routeName: confirm.route.name,
					driverName: confirm.route.driverName
				});
			}

			return m.manager_override_suspend_route_description_unfilled({
				routeName: confirm.route.name
			});
		}

		if (confirm.action === 'resume_route') {
			return m.manager_override_resume_route_description({ routeName: confirm.route.name });
		}

		if (confirm.route.driverName) {
			return m.manager_override_open_urgent_bidding_description_assigned({
				routeName: confirm.route.name,
				driverName: confirm.route.driverName,
				bonusPercent: urgentBonusPercent
			});
		}

		return m.manager_override_open_urgent_bidding_description_unfilled({
			routeName: confirm.route.name,
			bonusPercent: urgentBonusPercent
		});
	}

	function getOverrideConfirmLabel(action: RouteOverrideAction): string {
		if (action === 'open_bidding') {
			return m.manager_override_open_bidding_confirm();
		}

		if (action === 'open_urgent_bidding') {
			return m.manager_override_open_urgent_bidding_confirm();
		}

		return action === 'suspend_route'
			? m.manager_override_suspend_route_confirm()
			: m.manager_override_resume_route_confirm();
	}

	function getAssignButtonLabel(route: RouteWithWarehouse): string {
		return route.assignmentStatus === 'scheduled' && route.driverName
			? m.manager_override_reassign_button()
			: m.manager_dashboard_assign_button();
	}

	function openRouteAssignModal(route: RouteWithWarehouse) {
		if (!canManualAssignRoute(route)) return;
		routeAssignTarget = route;
		routeAssignDriverId = '';
		routeAssignErrors = {};
		showRouteAssignModal = true;
		if (!driverStore.isLoading && driverStore.drivers.length === 0) {
			driverStore.load();
		}
	}

	function closeRouteAssignModal() {
		showRouteAssignModal = false;
		routeAssignTarget = null;
		routeAssignDriverId = '';
		routeAssignErrors = {};
	}

	async function handleRouteAssignDriver() {
		if (!routeAssignTarget?.assignmentId) return;
		if (!routeAssignDriverId) {
			routeAssignErrors = { driverId: [m.bid_windows_assign_driver_error()] };
			return;
		}

		const driver = driverStore.drivers.find((item) => item.id === routeAssignDriverId);
		if (!driver) {
			routeAssignErrors = { driverId: [m.bid_windows_assign_driver_error()] };
			return;
		}

		const result = await routeStore.manualAssign(routeAssignTarget.assignmentId, {
			id: driver.id,
			name: driver.name
		});

		if (result.ok) {
			closeRouteAssignModal();
			return;
		}

		if (result.message) {
			routeAssignErrors = { driverId: [result.message] };
		}
	}

	function openAssignModal(window: BidWindow) {
		assignTargetWindow = window;
		assignDriverId = '';
		assignErrors = {};
		showAssignModal = true;
		if (!driverStore.isLoading && driverStore.drivers.length === 0) {
			driverStore.load();
		}
	}

	function closeAssignModal() {
		showAssignModal = false;
		assignTargetWindow = null;
		assignDriverId = '';
		assignErrors = {};
	}

	function handleAssignDriver() {
		if (!assignTargetWindow) return;
		if (!assignDriverId) {
			assignErrors = { driverId: [m.bid_windows_assign_driver_error()] };
			return;
		}

		const driver = driverStore.drivers.find((item) => item.id === assignDriverId);
		if (!driver) {
			assignErrors = { driverId: [m.bid_windows_assign_driver_error()] };
			return;
		}

		bidWindowStore.manualAssign(assignTargetWindow, { id: driver.id, name: driver.name });
		closeAssignModal();
	}

	function openCloseConfirm(window: BidWindow) {
		closeConfirmWindow = window;
	}

	function closeCloseConfirm() {
		closeConfirmWindow = null;
	}

	function handleCloseWindow() {
		if (!closeConfirmWindow) return;
		bidWindowStore.closeWindow(closeConfirmWindow);
		closeCloseConfirm();
	}

	function openOverrideConfirm(
		route: RouteWithWarehouse,
		action: RouteOverrideAction,
		event: MouseEvent
	) {
		if (!route.assignmentId) return;
		overrideConfirm = {
			route,
			action,
			x: event.clientX,
			y: event.clientY
		};
	}

	async function handleOverrideAction() {
		if (!overrideConfirm?.route.assignmentId) return;
		if (!ensureOnlineForWrite()) return;

		const assignmentId = overrideConfirm.route.assignmentId;
		const action = overrideConfirm.action;
		overrideConfirm = null;

		if (action === 'open_bidding') {
			await routeStore.openBidding(assignmentId);
			return;
		}

		if (action === 'open_urgent_bidding') {
			await routeStore.openUrgentBidding(assignmentId);
			return;
		}

		if (action === 'suspend_route') {
			await routeStore.suspendRoute(assignmentId);
			return;
		}

		await routeStore.resumeRoute(assignmentId);
	}

	async function loadDispatchSettingsBonus() {
		try {
			const response = await fetch('/api/settings/dispatch');
			if (!response.ok) return;

			const payload = (await response.json()) as {
				settings?: { emergencyBonusPercent?: unknown };
			};

			if (typeof payload.settings?.emergencyBonusPercent === 'number') {
				urgentBonusPercent = payload.settings.emergencyBonusPercent;
			}
		} catch {
			// Keep default bonus for confirmation copy when settings are unavailable.
		}
	}

	// Load data on mount
	onMount(() => {
		warehouseStore.load();
		void applyFilters().finally(() => {
			hasLoadedRoutes = true;
		});
		startRealtime();
		void loadDispatchSettingsBonus();
	});

	// Cleanup on destroy
	onDestroy(() => {
		bidWindowStore.stopPolling();
		managerStream?.close();
		refreshRoutes.cancel();
		refreshBidWindows.cancel();
		refreshDrivers.cancel();
	});
</script>

{#snippet driverCell(ctx: CellRendererContext<RouteWithWarehouse>)}
	{#if ctx.row.status === 'assigned' && ctx.row.driverName}
		<span class="driver-name">{ctx.row.driverName}</span>
	{:else if ctx.row.status === 'suspended'}
		<span class="driver-unassigned">{m.route_status_suspended()}</span>
	{:else if ctx.row.status === 'bidding' && ctx.row.bidWindowClosesAt}
		<span class="bid-closes">{formatBidWindowLabel(ctx.row.bidWindowClosesAt)}</span>
	{:else}
		<span class="driver-unassigned">{m.manager_dashboard_driver_unassigned()}</span>
	{/if}
{/snippet}

{#snippet statusCell(ctx: CellRendererContext<RouteWithWarehouse>)}
	{#if ctx.row.shiftProgress}
		<Chip
			variant="status"
			status={progressChip[ctx.row.shiftProgress]}
			label={progressLabels[ctx.row.shiftProgress]}
			size="xs"
		/>
	{:else}
		<Chip
			variant="status"
			status={statusChip[ctx.row.status]}
			label={statusLabels[ctx.row.status]}
			size="xs"
		/>
	{/if}
{/snippet}

{#snippet tabsSnippet()}
	<div class="tab-bar" role="tablist">
		<button
			type="button"
			class="tab"
			class:active={activeTab === 'routes'}
			role="tab"
			aria-selected={activeTab === 'routes'}
			tabindex={activeTab === 'routes' ? 0 : -1}
			onclick={() => switchTab('routes')}
		>
			{m.route_page_title()}
		</button>
		<button
			type="button"
			class="tab tab-unfilled"
			class:active={activeTab === 'unfilled'}
			class:has-alert={unfilledRouteCount > 0}
			role="tab"
			aria-selected={activeTab === 'unfilled'}
			tabindex={activeTab === 'unfilled' ? 0 : -1}
			onclick={() => switchTab('unfilled')}
		>
			<span class="tab-content">
				<span>{m.manager_attention_unfilled()}</span>
				<span class="tab-alert-badge" aria-live="polite">
					<span class="tab-alert-icon" aria-hidden="true">
						<AlertCircleIcon />
					</span>
					<span>{unfilledRouteCount}</span>
				</span>
			</span>
		</button>
		<button
			type="button"
			class="tab"
			class:active={activeTab === 'bidWindows'}
			role="tab"
			aria-selected={activeTab === 'bidWindows'}
			tabindex={activeTab === 'bidWindows' ? 0 : -1}
			onclick={() => switchTab('bidWindows')}
		>
			{m.bid_windows_tab()}
		</button>
	</div>
{/snippet}

{#snippet toolbarSnippet()}
	<span class="date-view-chip">
		<Chip
			label={formatDateChipLabel(dateFilter)}
			size="sm"
			onDismiss={dateFilter !== toLocalYmd() ? clearDateFilter : undefined}
		/>
	</span>

	<IconButton tooltip={m.table_filter_label()} onclick={() => (showFilterDrawer = true)}>
		<Icon><Filter /></Icon>
	</IconButton>

	<IconButton tooltip={m.route_create_button()} onclick={openCreateModal}>
		<Icon><Plus /></Icon>
	</IconButton>

	<IconButton tooltip={m.table_columns_reset_sizes()} onclick={resetFilters}>
		<Icon><Reset /></Icon>
	</IconButton>
{/snippet}

{#snippet filtersSnippet()}
	{#if warehouseFilter && warehouseChipLabel}
		<Chip label={warehouseChipLabel} size="sm" onDismiss={clearWarehouseFilter} />
	{/if}
	{#if statusFilter}
		<Chip
			variant="status"
			status={statusChip[statusFilter]}
			label={statusLabels[statusFilter]}
			size="sm"
			onDismiss={clearStatusFilter}
		/>
	{/if}
	{#if progressFilter}
		{@const filterLabel =
			progressFilterOptions.find((o) => o.value === progressFilter)?.label ?? progressFilter}
		<Chip
			variant="status"
			status="info"
			label={filterLabel}
			size="sm"
			onDismiss={clearProgressFilter}
		/>
	{/if}
{/snippet}

{#snippet routeDetailInfo(route: RouteWithWarehouse)}
	<dl class="detail-list">
		<div class="detail-row">
			<dt>{m.manager_dashboard_detail_route()}</dt>
			<dd>{route.name}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.manager_dashboard_detail_warehouse()}</dt>
			<dd>{route.warehouseName}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.route_start_time_label()}</dt>
			<dd>{route.startTime}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.manager_dashboard_detail_date()}</dt>
			<dd>{formatDate(dateFilter)}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.manager_dashboard_detail_status()}</dt>
			<dd>
				{#if route.shiftProgress}
					<Chip
						variant="status"
						status={progressChip[route.shiftProgress]}
						label={progressLabels[route.shiftProgress]}
						size="xs"
					/>
				{:else}
					<Chip
						variant="status"
						status={statusChip[route.status]}
						label={statusLabels[route.status]}
						size="xs"
					/>
				{/if}
			</dd>
		</div>
		{#if route.status === 'assigned' && route.driverName}
			<div class="detail-row">
				<dt>{m.manager_dashboard_detail_driver()}</dt>
				<dd>{route.driverName}</dd>
			</div>
		{/if}
		{#if route.status === 'bidding' && route.bidWindowClosesAt}
			<div class="detail-row">
				<dt>{m.manager_dashboard_detail_bid_window()}</dt>
				<dd>{formatBidWindowLabel(route.bidWindowClosesAt)}</dd>
			</div>
		{/if}
		{#if route.confirmedAt}
			<div class="detail-row">
				<dt>{m.route_detail_confirmed_at()}</dt>
				<dd>{formatTimestamp(route.confirmedAt)}</dd>
			</div>
		{/if}
		{#if route.arrivedAt}
			<div class="detail-row">
				<dt>{m.route_detail_arrived_at()}</dt>
				<dd>{formatTimestamp(route.arrivedAt)}</dd>
			</div>
		{/if}
		{#if route.startedAt}
			<div class="detail-row">
				<dt>{m.route_detail_started_at()}</dt>
				<dd>{formatTimestamp(route.startedAt)}</dd>
			</div>
		{/if}
		{#if route.completedAt}
			<div class="detail-row">
				<dt>{m.route_detail_completed_at()}</dt>
				<dd>{formatTimestamp(route.completedAt)}</dd>
			</div>
		{/if}
		{#if getRouteSuspendAction(route)}
			<div class="detail-row">
				<dt>{m.route_status_suspended()}</dt>
				<dd>
					<Toggle
						checked={route.status === 'suspended'}
						disabled={isRouteOverriding(route)}
						variant="warning"
						onchange={async (checked) => {
							if (!route.assignmentId) return;
							if (checked) {
								await routeStore.suspendRoute(route.assignmentId);
							} else {
								await routeStore.resumeRoute(route.assignmentId);
							}
						}}
					/>
				</dd>
			</div>
		{/if}
	</dl>

	{#if !route.assignmentId}
		<p class="detail-hint">{m.manager_dashboard_detail_no_assignment()}</p>
	{:else if route.status === 'bidding'}
		<p class="detail-hint">{m.bid_windows_assign_description()}</p>
	{/if}
{/snippet}

{#snippet routeDetailView(route: RouteWithWarehouse)}
	<div class="detail-content">
		{@render routeDetailInfo(route)}
	</div>
{/snippet}

{#snippet routeDetailEditFields(route: RouteWithWarehouse)}
	<div class="form-field">
		<label for="route-edit-name">{m.route_name_label()}</label>
		<InlineEditor
			id="route-edit-name"
			value={formName}
			onInput={(v) => (formName = v)}
			placeholder={m.route_name_placeholder()}
			required
		/>
		{#if formErrors.name}
			<p class="field-error">{formErrors.name[0]}</p>
		{/if}
	</div>

	<div class="form-field">
		<label for="route-edit-start-time">{m.route_start_time_label()}</label>
		<InlineEditor
			id="route-edit-start-time"
			value={formStartTime}
			onInput={(v) => (formStartTime = v)}
			placeholder={m.route_start_time_placeholder()}
			required
		/>
		{#if formErrors.startTime}
			<p class="field-error">{formErrors.startTime[0]}</p>
		{/if}
	</div>

	<div class="form-field">
		<label for="route-edit-warehouse">{m.route_warehouse_label()}</label>
		<Select
			id="route-edit-warehouse"
			options={warehouseFormOptions}
			bind:value={formWarehouseId}
			placeholder={m.route_warehouse_placeholder()}
			errors={formErrors.warehouseId}
		/>
	</div>
{/snippet}

{#snippet routeDetailEdit(route: RouteWithWarehouse)}
	<div class="detail-content">
		{@render routeDetailEditFields(route)}
	</div>
{/snippet}

{#snippet routeHeaderActions(route: RouteWithWarehouse)}
	<IconButton tooltip={m.common_edit()} onclick={() => startEditing(route)}>
		<Icon><Pencil /></Icon>
	</IconButton>
	<IconButton tooltip={m.common_delete()} onclick={(e) => openDeleteConfirm(route, e)}>
		<Icon><Trash /></Icon>
	</IconButton>
{/snippet}

{#snippet routeFooterActions(route: RouteWithWarehouse)}
	{@const bidOverrideAction = getRouteBidOverrideAction(route)}
	{@const canAssign = canManualAssignRoute(route)}
	{#if bidOverrideAction || canAssign}
		<div class="route-footer-actions">
			{#if bidOverrideAction}
				<Button
					fill
					size="small"
					variant="ghost"
					onclick={(e) => openOverrideConfirm(route, bidOverrideAction, e)}
					disabled={isRouteAssigning(route) || isRouteOverriding(route)}
					isLoading={isRouteOverriding(route)}
				>
					{getOverrideActionLabel(bidOverrideAction)}
				</Button>
			{/if}
			{#if canAssign}
				<Button
					fill
					size="small"
					onclick={() => openRouteAssignModal(route)}
					disabled={isRouteAssigning(route) || isRouteOverriding(route)}
					isLoading={isRouteAssigning(route)}
				>
					{getAssignButtonLabel(route)}
				</Button>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet mobileDetail(route: RouteWithWarehouse)}
	<div class="detail-content">
		{#if isEditing}
			{@render routeDetailEditFields(route)}
		{:else}
			{@render routeDetailInfo(route)}
		{/if}

		<div class="detail-actions">
			{#if isEditing}
				<Button variant="secondary" fill onclick={cancelEditing}>
					{m.common_cancel()}
				</Button>
				<Button fill disabled={!hasChanges} onclick={handleSave}>
					{m.common_save()}
				</Button>
			{:else}
				<Button fill onclick={() => startEditing(route)}>
					{m.common_edit()}
				</Button>
				<Button variant="secondary" size="small" fill onclick={(e) => openDeleteConfirm(route, e)}>
					{m.common_delete()}
				</Button>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet bidWindowDetailInfo(window: BidWindow)}
	<dl class="detail-list">
		<div class="detail-row">
			<dt>{m.bid_windows_detail_route()}</dt>
			<dd>{window.routeName}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.bid_windows_detail_warehouse()}</dt>
			<dd>{window.warehouseName}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.bid_windows_detail_date()}</dt>
			<dd>{formatDate(window.assignmentDate)}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.bid_windows_detail_status()}</dt>
			<dd>
				{#if window.status === 'open'}
					<Chip variant="status" status="info" label={m.bid_windows_status_open()} size="xs" />
				{:else}
					<Chip
						variant="status"
						status="neutral"
						label={m.bid_windows_status_resolved()}
						size="xs"
					/>
				{/if}
			</dd>
		</div>
		<div class="detail-row">
			<dt>{m.bid_windows_detail_bids()}</dt>
			<dd>{window.bidCount}</dd>
		</div>
		{#if window.status === 'resolved'}
			<div class="detail-row">
				<dt>{m.bid_windows_detail_winner()}</dt>
				<dd>
					{#if window.winnerName}
						{window.winnerName}
					{:else}
						<span class="winner-unfilled">{m.bid_windows_winner_unfilled()}</span>
					{/if}
				</dd>
			</div>
		{/if}
		{#if window.status === 'open'}
			<div class="detail-row">
				<dt>{m.bid_windows_detail_closes()}</dt>
				<dd>{new Date(window.closesAt).toLocaleTimeString()}</dd>
			</div>
		{/if}
	</dl>
{/snippet}

{#snippet bidWindowDetailView(window: BidWindow)}
	<div class="detail-content">
		{@render bidWindowDetailInfo(window)}
	</div>
{/snippet}

{#snippet bidWindowDetailActions(window: BidWindow)}
	<Button
		fill
		onclick={() => openAssignModal(window)}
		disabled={!canManualAssign(window) ||
			bidWindowStore.isAssigning(window.id) ||
			bidWindowStore.isClosing(window.id)}
		isLoading={bidWindowStore.isAssigning(window.id)}
	>
		{m.bid_windows_assign_button()}
	</Button>
	<Button
		variant="secondary"
		fill
		onclick={() => openCloseConfirm(window)}
		disabled={window.status !== 'open' ||
			bidWindowStore.isAssigning(window.id) ||
			bidWindowStore.isClosing(window.id)}
		isLoading={bidWindowStore.isClosing(window.id)}
	>
		{m.bid_windows_close_button()}
	</Button>
{/snippet}

{#snippet bidWindowMobileDetail(window: BidWindow)}
	<div class="detail-content">
		{@render bidWindowDetailInfo(window)}

		<div class="detail-actions">
			<Button
				fill
				onclick={() => openAssignModal(window)}
				disabled={!canManualAssign(window) ||
					bidWindowStore.isAssigning(window.id) ||
					bidWindowStore.isClosing(window.id)}
				isLoading={bidWindowStore.isAssigning(window.id)}
			>
				{m.bid_windows_assign_button()}
			</Button>
			<Button
				variant="secondary"
				fill
				onclick={() => openCloseConfirm(window)}
				disabled={window.status !== 'open' ||
					bidWindowStore.isAssigning(window.id) ||
					bidWindowStore.isClosing(window.id)}
				isLoading={bidWindowStore.isClosing(window.id)}
			>
				{m.bid_windows_close_button()}
			</Button>
		</div>
	</div>
{/snippet}

{#snippet bidWindowsToolbarSnippet()}
	<IconButton tooltip={m.table_columns_reset_sizes()} onclick={() => bidWindowStore.load()}>
		<Icon><Reset /></Icon>
	</IconButton>
{/snippet}

{#snippet bidWindowsTabsSnippet()}
	<div class="tab-bar" role="tablist">
		<button
			type="button"
			class="tab"
			class:active={activeTab === 'routes'}
			role="tab"
			aria-selected={activeTab === 'routes'}
			tabindex={activeTab === 'routes' ? 0 : -1}
			onclick={() => switchTab('routes')}
		>
			{m.route_page_title()}
		</button>
		<button
			type="button"
			class="tab tab-unfilled"
			class:active={activeTab === 'unfilled'}
			class:has-alert={unfilledRouteCount > 0}
			role="tab"
			aria-selected={activeTab === 'unfilled'}
			tabindex={activeTab === 'unfilled' ? 0 : -1}
			onclick={() => switchTab('unfilled')}
		>
			<span class="tab-content">
				<span>{m.manager_attention_unfilled()}</span>
				<span class="tab-alert-badge" aria-live="polite">
					<span class="tab-alert-icon" aria-hidden="true">
						<AlertCircleIcon />
					</span>
					<span>{unfilledRouteCount}</span>
				</span>
			</span>
		</button>
		<button
			type="button"
			class="tab"
			class:active={activeTab === 'bidWindows'}
			role="tab"
			aria-selected={activeTab === 'bidWindows'}
			tabindex={activeTab === 'bidWindows' ? 0 : -1}
			onclick={() => switchTab('bidWindows')}
		>
			{m.bid_windows_tab()}
		</button>
	</div>
{/snippet}

{#snippet tableContent(ctx: {
	isWideMode: boolean;
	onWideModeChange: (value: boolean) => void;
	isMobile: boolean;
})}
	{#if activeTab !== 'bidWindows'}
		<DataTable
			{table}
			loading={routesTableLoading}
			emptyTitle={m.route_empty_state()}
			emptyMessage={m.route_empty_state_message()}
			showPagination
			showSelection={false}
			showColumnVisibility
			showExport
			showWideModeToggle
			isWideMode={ctx.isWideMode}
			onWideModeChange={ctx.onWideModeChange}
			onMobileDetailOpen={syncSelectedRoute}
			stateStorageKey="routes"
			exportFilename="routes"
			tabs={tabsSnippet}
			filters={filtersSnippet}
			toolbar={toolbarSnippet}
			cellComponents={{
				driver: driverCell,
				status: statusCell
			}}
			activeRowId={selectedRouteId ?? undefined}
			onRowClick={handleRowClick}
			mobileDetailContent={mobileDetail}
			mobileDetailTitle={m.manager_dashboard_detail_title()}
		/>
	{:else}
		<BidWindowsTable
			onRowClick={handleBidWindowRowClick}
			activeRowId={selectedBidWindowId}
			isWideMode={ctx.isWideMode}
			onWideModeChange={ctx.onWideModeChange}
			mobileDetailContent={bidWindowMobileDetail}
			onMobileDetailOpen={syncSelectedBidWindow}
			tabs={bidWindowsTabsSnippet}
			toolbar={bidWindowsToolbarSnippet}
		/>
	{/if}
{/snippet}

<svelte:head>
	<title>{m.route_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	{#if activeTab !== 'bidWindows'}
		<PageWithDetailPanel
			item={selectedRoute}
			title={m.manager_dashboard_detail_title()}
			open={!!selectedRoute}
			onClose={clearSelection}
			{isEditing}
			{hasChanges}
			onEditToggle={handleEditToggle}
			onSave={handleSave}
			viewContent={routeDetailView}
			editContent={routeDetailEdit}
			headerActions={routeHeaderActions}
			viewActions={routeFooterActions}
			showDefaultViewEditAction={false}
			{tableContent}
			storageKey="routes"
		/>
	{:else}
		<PageWithDetailPanel
			item={selectedBidWindow}
			title={m.bid_windows_detail_title()}
			open={!!selectedBidWindow}
			onClose={clearBidWindowSelection}
			isEditing={false}
			hasChanges={false}
			viewContent={bidWindowDetailView}
			viewActions={bidWindowDetailActions}
			{tableContent}
			storageKey="bid-windows"
		/>
	{/if}
</div>

<!-- Filter Drawer -->
{#if showFilterDrawer}
	<Drawer title={m.table_filter_title()} onClose={() => (showFilterDrawer = false)}>
		<div class="filter-form">
			<div class="filter-field">
				<label for="route-warehouse-filter">{m.route_filter_warehouse_label()}</label>
				<Select
					id="route-warehouse-filter"
					options={warehouseFilterOptions}
					bind:value={warehouseFilter}
				/>
			</div>
			<div class="filter-field">
				<label for="route-status-filter">{m.route_filter_status_label()}</label>
				<Select id="route-status-filter" options={statusOptions} bind:value={statusFilter} />
			</div>
			<div class="filter-field">
				<label for="route-progress-filter">{m.route_filter_progress_label()}</label>
				<Select
					id="route-progress-filter"
					options={progressFilterOptions}
					value={progressFilterSelectValue}
					onChange={(val) => {
						progressFilter = String(val) || null;
					}}
				/>
			</div>
			<div class="filter-field">
				<label for="route-date-filter">{m.route_filter_date_label()}</label>
				<DatePicker
					id="route-date-filter"
					bind:value={dateFilter}
					placeholder={m.route_filter_date_placeholder()}
				/>
			</div>
			<div class="filter-actions">
				<Button variant="secondary" size="small" onclick={resetFilters} fill>
					{m.table_filter_clear_all()}
				</Button>
				<Button
					size="small"
					onclick={() => {
						applyFilters();
						showFilterDrawer = false;
					}}
					fill
				>
					{m.common_confirm()}
				</Button>
			</div>
		</div>
	</Drawer>
{/if}

<!-- Create Modal -->
{#if showCreateModal}
	<Modal title={m.route_create_title()} onClose={closeModals}>
		<form
			class="modal-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleCreate();
			}}
		>
			<div class="form-field">
				<label for="create-name">{m.route_name_label()}</label>
				<InlineEditor
					id="create-name"
					value={formName}
					onInput={(v) => (formName = v)}
					placeholder={m.route_name_placeholder()}
					required
				/>
				{#if formErrors.name}
					<p class="field-error">{formErrors.name[0]}</p>
				{/if}
			</div>

			<div class="form-field">
				<label for="create-start-time">{m.route_start_time_label()}</label>
				<InlineEditor
					id="create-start-time"
					value={formStartTime}
					onInput={(v) => (formStartTime = v)}
					placeholder={m.route_start_time_placeholder()}
					required
				/>
				{#if formErrors.startTime}
					<p class="field-error">{formErrors.startTime[0]}</p>
				{/if}
			</div>

			<div class="form-field">
				<label for="create-warehouse">{m.route_warehouse_label()}</label>
				<Select
					id="create-warehouse"
					options={warehouseFormOptions}
					bind:value={formWarehouseId}
					placeholder={m.route_warehouse_placeholder()}
					errors={formErrors.warehouseId}
				/>
			</div>

			<div class="modal-actions">
				<Button variant="secondary" onclick={closeModals} fill>
					{m.common_cancel()}
				</Button>
				<Button type="submit" fill>
					{m.common_create()}
				</Button>
			</div>
		</form>
	</Modal>
{/if}

<!-- Route Manual Assign Modal -->
{#if showRouteAssignModal && routeAssignTarget}
	<Modal
		title={getAssignButtonLabel(routeAssignTarget)}
		description={m.bid_windows_assign_description()}
		onClose={closeRouteAssignModal}
	>
		<form
			class="modal-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleRouteAssignDriver();
			}}
		>
			<p class="modal-meta">
				{routeAssignTarget.name} · {formatDate(dateFilter)}
			</p>
			<div class="form-field">
				<label for="route-assign-driver">{m.bid_windows_assign_driver_label()}</label>
				<Select
					id="route-assign-driver"
					options={driverOptions}
					bind:value={routeAssignDriverId}
					placeholder={m.bid_windows_assign_driver_placeholder()}
					errors={routeAssignErrors.driverId}
					disabled={driverStore.isLoading ||
						!routeAssignTarget.assignmentId ||
						routeStore.isAssigningAssignment(routeAssignTarget.assignmentId)}
					onChange={() => {
						routeAssignErrors = {};
					}}
				/>
			</div>

			<div class="modal-actions">
				<Button variant="secondary" onclick={closeRouteAssignModal} fill>
					{m.common_cancel()}
				</Button>
				<Button
					type="submit"
					fill
					disabled={!routeAssignTarget.assignmentId ||
						routeStore.isAssigningAssignment(routeAssignTarget.assignmentId)}
					isLoading={routeAssignTarget.assignmentId
						? routeStore.isAssigningAssignment(routeAssignTarget.assignmentId)
						: false}
				>
					{m.bid_windows_assign_submit()}
				</Button>
			</div>
		</form>
	</Modal>
{/if}

<!-- Manual Assign Modal -->
{#if showAssignModal && assignTargetWindow}
	<Modal
		title={m.bid_windows_assign_title()}
		description={m.bid_windows_assign_description()}
		onClose={closeAssignModal}
	>
		<form
			class="modal-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleAssignDriver();
			}}
		>
			<p class="modal-meta">
				{assignTargetWindow.routeName} · {formatDate(assignTargetWindow.assignmentDate)}
			</p>
			<div class="form-field">
				<label for="assign-driver">{m.bid_windows_assign_driver_label()}</label>
				<Select
					id="assign-driver"
					options={driverOptions}
					bind:value={assignDriverId}
					placeholder={m.bid_windows_assign_driver_placeholder()}
					errors={assignErrors.driverId}
					disabled={driverStore.isLoading || bidWindowStore.isAssigning(assignTargetWindow.id)}
				/>
			</div>

			<div class="modal-actions">
				<Button variant="secondary" onclick={closeAssignModal} fill>
					{m.common_cancel()}
				</Button>
				<Button
					type="submit"
					fill
					disabled={bidWindowStore.isAssigning(assignTargetWindow.id)}
					isLoading={bidWindowStore.isAssigning(assignTargetWindow.id)}
				>
					{m.bid_windows_assign_submit()}
				</Button>
			</div>
		</form>
	</Modal>
{/if}

<!-- Close Bid Window Modal -->
{#if closeConfirmWindow}
	<Modal
		title={m.bid_windows_close_title()}
		description={m.bid_windows_close_description()}
		onClose={closeCloseConfirm}
	>
		<div class="modal-form">
			<p class="modal-meta">
				{closeConfirmWindow.routeName} · {formatDate(closeConfirmWindow.assignmentDate)}
			</p>
			<div class="modal-actions">
				<Button variant="secondary" onclick={closeCloseConfirm} fill>
					{m.common_cancel()}
				</Button>
				<Button
					fill
					onclick={handleCloseWindow}
					disabled={bidWindowStore.isClosing(closeConfirmWindow.id)}
					isLoading={bidWindowStore.isClosing(closeConfirmWindow.id)}
				>
					{m.bid_windows_close_confirm()}
				</Button>
			</div>
		</div>
	</Modal>
{/if}

<!-- Delete Confirmation -->
{#if deleteConfirm}
	<ConfirmationDialog
		x={deleteConfirm.x}
		y={deleteConfirm.y}
		title={m.route_delete_title()}
		description={m.route_delete_confirm()}
		confirmLabel={m.common_delete()}
		confirmVariant="danger"
		onConfirm={handleDelete}
		onCancel={() => (deleteConfirm = null)}
	/>
{/if}

<!-- Override Confirmation -->
{#if overrideConfirm}
	<ConfirmationDialog
		x={overrideConfirm.x}
		y={overrideConfirm.y}
		title={getOverrideConfirmTitle(overrideConfirm.action)}
		description={getOverrideConfirmDescription(overrideConfirm)}
		confirmLabel={getOverrideConfirmLabel(overrideConfirm.action)}
		confirmVariant="danger"
		onConfirm={handleOverrideAction}
		onCancel={() => (overrideConfirm = null)}
	/>
{/if}

<style>
	/* Driver cell styling */
	.driver-name {
		color: var(--text-normal);
	}

	.driver-unassigned {
		color: var(--text-muted);
	}

	.bid-closes {
		color: var(--status-info);
		font-size: var(--font-size-sm);
	}

	/* Detail panel */
	.detail-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-6);
	}

	.detail-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		margin: 0;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-3) 0;
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		min-height: 44px;
	}

	.detail-row:last-child {
		border-bottom: none;
	}

	.detail-row dt {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.detail-row dd {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-normal);
	}

	.detail-actions {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.route-footer-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		width: 100%;
	}

	.detail-hint {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		text-align: center;
	}

	/* Tab bar styling - matching Drive pattern */
	.tab-bar {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		height: 48px;
		flex-shrink: 0;
		padding-bottom: 1px;
		margin-bottom: -1px;
	}

	.tab {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--spacing-3);
		height: 32px;
		border: none;
		border-radius: var(--radius-lg);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		z-index: 1;
		transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
		white-space: nowrap;
	}

	.tab:not(.active):hover {
		background: var(--interactive-hover);
		color: var(--text-normal);
	}

	.tab-content {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.tab-alert-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 20px;
		padding: 0 8px;
		border-radius: 999px;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--status-warning);
		background: color-mix(in srgb, var(--status-warning) 16%, transparent);
		line-height: 1;
	}

	.tab-alert-icon {
		display: inline-flex;
		width: 12px;
		height: 12px;
	}

	.tab-alert-icon :global(svg) {
		width: 100%;
		height: 100%;
	}

	.tab:not(.active):hover .tab-alert-badge {
		background: color-mix(in srgb, var(--status-warning) 24%, transparent);
	}

	.tab.tab-unfilled.has-alert .tab-alert-badge {
		color: var(--status-error);
		background: color-mix(in srgb, var(--status-error) 16%, transparent);
	}

	.tab.tab-unfilled.has-alert:not(.active):hover .tab-alert-badge {
		background: color-mix(in srgb, var(--status-error) 24%, transparent);
	}

	.tab.active {
		align-self: flex-end;
		height: 48px;
		background: var(--surface-primary);
		color: var(--text-normal);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		margin-bottom: -1px;
		z-index: 10;
	}

	.tab.active .tab-alert-badge {
		color: var(--status-warning);
		background: color-mix(in srgb, var(--status-warning) 22%, transparent);
	}

	.tab.active.tab-unfilled.has-alert .tab-alert-badge {
		color: var(--status-error);
		background: color-mix(in srgb, var(--status-error) 28%, transparent);
	}

	.tab.active::before,
	.tab.active::after {
		content: '';
		position: absolute;
		bottom: 0;
		width: var(--radius-lg);
		height: var(--radius-lg);
		pointer-events: none;
		z-index: 1;
	}

	.tab.active::before {
		left: calc(var(--radius-lg) * -1);
		background: radial-gradient(
			circle at 0 0,
			transparent var(--radius-lg),
			var(--surface-primary) calc(var(--radius-lg) + 0.5px)
		);
	}

	.tab.active::after {
		right: calc(var(--radius-lg) * -1);
		background: radial-gradient(
			circle at 100% 0,
			transparent var(--radius-lg),
			var(--surface-primary) calc(var(--radius-lg) + 0.5px)
		);
	}

	.date-view-chip {
		display: inline-flex;
		align-items: center;
	}

	.date-view-chip :global(.chip) {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.date-view-chip :global(.chip-dismiss) {
		opacity: 0.75;
	}

	/* Filter drawer form */
	.filter-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.filter-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.filter-field label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.filter-actions {
		display: flex;
		gap: var(--spacing-2);
		margin-top: var(--spacing-2);
	}

	/* Modal form */
	.modal-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.modal-meta {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.form-field label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.field-error {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--status-error);
	}

	.modal-actions {
		display: flex;
		gap: var(--spacing-2);
		margin-top: var(--spacing-2);
	}

	/* Bid window detail styling */
	.winner-unfilled {
		color: var(--status-warning);
	}
</style>
