ALTER TABLE "bids" ADD COLUMN "bid_window_id" uuid;
--> statement-breakpoint

WITH ranked_matches AS (
	SELECT
		b.id AS bid_id,
		bw.id AS window_id,
		row_number() OVER (
			PARTITION BY b.id
			ORDER BY
				CASE WHEN bw.closes_at = b.window_closes_at THEN 0 ELSE 1 END,
				abs(extract(epoch FROM (bw.closes_at - b.window_closes_at))),
				bw.opens_at DESC,
				bw.id DESC
		) AS rn
	FROM bids b
	INNER JOIN bid_windows bw ON bw.assignment_id = b.assignment_id
	WHERE b.bid_window_id IS NULL
)
UPDATE bids b
SET bid_window_id = ranked_matches.window_id
FROM ranked_matches
WHERE b.id = ranked_matches.bid_id
	AND ranked_matches.rn = 1
	AND b.bid_window_id IS NULL;
--> statement-breakpoint

ALTER TABLE "bids" ALTER COLUMN "bid_window_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "bids" ADD CONSTRAINT "bids_bid_window_id_bid_windows_id_fk" FOREIGN KEY ("bid_window_id") REFERENCES "public"."bid_windows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "idx_bids_window_status" ON "bids" USING btree ("bid_window_id","status");
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_bids_window_user" ON "bids" USING btree ("bid_window_id","user_id");
--> statement-breakpoint

WITH ranked_open_windows AS (
	SELECT
		id,
		row_number() OVER (
			PARTITION BY assignment_id
			ORDER BY opens_at DESC, id DESC
		) AS rn
	FROM bid_windows
	WHERE status = 'open'
)
UPDATE bid_windows bw
SET status = 'closed'
FROM ranked_open_windows ranked
WHERE bw.id = ranked.id
	AND ranked.rn > 1;
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_bid_windows_open_assignment" ON "bid_windows" USING btree ("assignment_id") WHERE "status" = 'open';
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_assignments_active_user_date" ON "assignments" USING btree ("user_id","date") WHERE "user_id" IS NOT NULL AND "status" <> 'cancelled';
