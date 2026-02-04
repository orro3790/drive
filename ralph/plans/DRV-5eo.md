# Bid window closure cron job

Task: DRV-5eo

## Steps

1. Update src/routes/api/cron/close-bid-windows/+server.ts to query for expired bid windows (status='open' AND closesAt <= now) that have at least one pending bid.
2. For each expired window with bids, call resolveBidWindow() from the bidding service, wrapping in try/catch to isolate failures.
3. Log results: total windows processed, resolved count, error count, and individual errors.
4. Return JSON response with processing summary.
5. Update vercel.json schedule if needed (verify it runs frequently enough - currently `0 0 * * *` which is once daily, but spec says every minute).

## Acceptance Criteria

- Cron runs every minute (or appropriate frequency)
- Expired windows with bids are resolved via resolveBidWindow()
- Expired windows without bids remain open (spec: stays open indefinitely)
- Multiple windows can be processed in single run
- Job is idempotent (resolveBidWindow already handles non-open windows)
- Errors on one window don't block others
- Job execution logged with count of processed windows
