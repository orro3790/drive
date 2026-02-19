# API+UI: include route start time in bids lists

Task: DRV-hfh.2

## Steps

1. Inspect current bids available API response shape and identify where `routes.startTime` should be selected and mapped as `routeStartTime`.
2. Update the API handler in `src/routes/api/bids/available/+server.ts` so each available bid window payload includes `routeStartTime`.
3. Update the API handler in `src/routes/api/bids/mine/+server.ts` so each my-bid payload includes `routeStartTime`.
4. Update `src/lib/stores/bidsStore.svelte.ts` schemas/types to include `routeStartTime` for both available and my bids payload shapes and keep validation aligned with API responses.
5. Update `src/routes/(driver)/bids/+page.svelte` to render start time next to assignment date in both Available Bids and My Bids sections, using existing formatting helpers/conventions.
6. Run targeted tests and checks for bids API/store/UI paths and verify acceptance criteria end-to-end for both endpoints and both UI sections.

## Acceptance Criteria

- `/api/bids/available` returns `routeStartTime` for each available bid window.
- `/api/bids/mine` returns `routeStartTime` for each my-bid item.
- Bids UI shows shift date + start time in both Available Bids and My Bids sections.
- Zod schemas updated.
