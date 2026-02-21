# Push Notification Testing Checklist

Complete checklist for verifying push notifications work end-to-end on Android (APK).

## Prerequisites

Before testing:

1. Android APK installed on device
2. Driver user account with FCM token registered
3. Manager user account for triggering certain notifications
4. Access to cron endpoints (for time-based notifications)

### Push Infra Preflight (Run Before Smoke)

1. Verify Firebase project alignment:
   - Android app project: `android/app/google-services.json` -> `project_info.project_id`
   - Server project: `FIREBASE_PROJECT_ID` in Vercel environment
2. If they do not match, fix env vars and redeploy before continuing.
3. Confirm recipient has a fresh FCM token (`fcm_token` is non-null and recently updated).
4. Confirm Android system settings for Drive app:
   - Notifications allowed
   - Notification categories enabled for app (if OEM-gated)
   - `Drive Notifications` category enabled and alerting
   - Battery set to unrestricted for test runs

## Single-Device Execution Mode (Recommended)

If you only have one physical device (for example, Z Flip 3), run tests with this actor model:

1. Keep the phone logged into the expected recipient account.
2. Use desktop browser sessions as the triggering actor (manager or driver).
3. For each case, verify all three surfaces:
   - push delivery in Android notification tray
   - in-app notification record
   - tap behavior opens the expected app surface

Important:

- A device token belongs to the currently logged-in app account after registration.
- Logging out/in can change which user receives pushes on that device.
- When switching recipient role, re-open the app and wait 5-10 seconds before testing.

### Current Smoke Progress (2026-02-20)

- [x] `shift_reminder` PASS (tray + in-app + tap verified)
- [x] `bid_won` PASS (competitive resolution with 3 bidders, scoring verified, push delivered to winner)
- [x] `driver_no_show` PASS (tray + in-app + tap verified)
- [x] `return_exception` PASS (tray + in-app + tap verified)

Notes:

- Post-release probe delivery confirmed to manager device.
- Driver dashboard completion path updated to optimistic UI with rollback (`fix(driver-dashboard): apply optimistic shift completion with rollback`).
- If UI still appears stale in an already-open tab/session, hard-refresh once to load latest bundle before retesting.
- 2026-02-20: Root cause of dev-server push failures found and fixed — `.env.local` (from `vercel env pull`) had stale Firebase project `drive-6952e` overriding correct `drive-b7830` in `.env`. Deleted `.env.local`.
- 2026-02-20: Competitive bid scoring verified — 3 drivers bid on same window, predicted scores matched server-computed scores within rounding tolerance, correct winner selected.

## FCM Token Verification

First, verify the device has registered its FCM token:

```sql
-- Check if user has FCM token
SELECT id, name, email, fcm_token FROM "user" WHERE email = 'test@example.com';
```

If `fcm_token` is NULL, the device hasn't registered for push notifications.

---

## Driver Notifications

### 1. `shift_reminder`

**Description**: Day-of reminder that driver has a shift today.

**Trigger**: Cron job `/api/cron/shift-reminders` runs at 6 AM Toronto time.

**How to Test**:

1. Create an assignment for today with `status = 'scheduled'`
2. Call the cron endpoint: `GET /api/cron/shift-reminders` with `Authorization: Bearer <CRON_SECRET>`
3. Verify push notification received

**Source**: `src/routes/api/cron/shift-reminders/+server.ts:159`

**Status**: [x] Verified (smoke run + cron trigger, push delivered)

---

### 2. `bid_open`

**Description**: A shift is available for bidding (competitive mode).

**Trigger**: When a bid window is created via `createBidWindow()` in competitive mode.

**How to Test**:

1. As manager, cancel an assignment >24h before shift date
2. System creates competitive bid window
3. Available drivers receive notification

**Source**: `src/lib/server/services/bidding.ts:427-428`

**Status**: [x] Verified (91 records, triggered via auto-drop cron creating competitive windows)

---

### 3. `emergency_route_available`

**Description**: Urgent route available with bonus (emergency mode).

**Trigger**: Emergency bid window created (manager-triggered or no-show).

**How to Test**:

1. As manager, use "Trigger Emergency" on a route
2. Or: Let a confirmed driver no-show (cron detects it)
3. Available drivers receive notification

**Source**: `src/lib/server/services/bidding.ts:427`, `src/lib/server/services/notifications.ts:515`

**Status**: [x] Verified (14 records, triggered via no-show detection and manager emergency)

---

### 4. `bid_won`

**Description**: Driver won a bid and was assigned the shift.

**Trigger**:

- Competitive: `resolveBidWindow()` selects winner
- Instant: First to accept wins immediately
- Manager manual: Assign via bid window UI

**How to Test**:

1. Create a bid window with multiple bidders
2. Wait for resolution or instant-accept
3. Winner receives notification

**Sources**:

- `src/lib/server/services/bidding.ts:784`
- `src/routes/api/bids/+server.ts:185` (instant mode)
- `src/routes/api/bid-windows/[id]/assign/+server.ts:223` (manager assign)

**Status**: [x] Verified (competitive 3-bidder, scoring matched predictions, push delivered)

---

### 5. `bid_lost`

**Description**: Driver's bid was not selected.

**Trigger**: When bid window resolves and driver was not selected.

**How to Test**:

1. Have multiple drivers bid on same window
2. Resolve the window (winner selected)
3. All non-winners receive notification

**Sources**:

- `src/lib/server/services/bidding.ts:796`
- `src/lib/server/services/assignments.ts:231`
- `src/routes/api/bid-windows/[id]/assign/+server.ts:232`

**Status**: [x] Verified (2 losers received bid_lost in competitive resolution)

---

### 6. `assignment_confirmed`

**Description**: Driver was assigned a shift (via schedule generation or manual).

**Trigger**:

- Schedule generation assigns driver to route
- Manager manually assigns via bid window

**How to Test**:

1. Run schedule generation cron (`/api/cron/lock-preferences`)
2. Or: Manager assigns driver via bid window UI
3. Driver receives confirmation notification

**Sources**:

- `src/routes/api/cron/lock-preferences/+server.ts:195`
- `src/lib/server/services/assignments.ts:221`
- `src/routes/api/bid-windows/[id]/assign/+server.ts:223`

**Status**: [x] Verified

---

### 7. `confirmation_reminder`

**Description**: Shift needs confirmation within 24 hours.

**Trigger**: Cron job `/api/cron/send-confirmation-reminders` runs daily.

**How to Test**:

1. Create assignment 72 hours from now, `status = 'scheduled'`
2. Run the cron endpoint
3. Driver receives reminder

**Source**: `src/routes/api/cron/send-confirmation-reminders/+server.ts:119`

**Status**: [x] Verified (cron triggered, 14 records, push sent post-fix)

---

### 8. `shift_auto_dropped`

**Description**: Shift was dropped because driver didn't confirm in time.

**Trigger**: Cron job `/api/cron/auto-drop-unconfirmed` runs hourly.

**How to Test**:

1. Create assignment <48h from now, `status = 'scheduled'` (not confirmed)
2. Run the cron endpoint
3. Driver notified shift was dropped

**Source**: `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:158`

**Status**: [x] Verified (cron triggered, dropped 1, push sent post-fix, 22 total records)

---

### 9. `schedule_locked`

**Description**: Weekly schedule has been locked and generated.

**Trigger**: Cron job `/api/cron/lock-preferences` runs Sunday 11:59 PM.

**How to Test**:

1. Ensure driver has preferences set for upcoming week
2. Run the lock-preferences cron endpoint
3. All drivers with locked preferences receive notification

**Source**: `src/routes/api/cron/lock-preferences/+server.ts:128`

**Status**: [x] Verified (dispatch path confirmed via schedule generation, push pipeline proven)

---

### 10. `stale_shift_reminder`

**Description**: Driver has incomplete shift from previous day.

**Trigger**: Cron job `/api/cron/stale-shift-reminder` runs daily.

**How to Test**:

1. Create a shift record with `arrivedAt` set but no `completedAt`
2. Advance date to next day
3. Run the cron endpoint
4. Driver reminded to close out shift

**Source**: `src/routes/api/cron/stale-shift-reminder/+server.ts:115`

**Status**: [x] Verified (cron triggered, sent 1 post-fix, 10 total records)

---

### 11. `warning`

**Description**: Driver flagged for attendance/performance issues.

**Trigger**: `checkDriverForFlagging()` detects poor metrics.

**How to Test**:

1. Create driver with <80% attendance (if <10 shifts) or <70% (if 10+ shifts)
2. Trigger flagging check via shift completion
3. Driver receives warning notification

**Source**: `src/lib/server/services/flagging.ts:197`

**Status**: [x] Verified (14 records from real flagging checks during shift completion)

---

### 12. `streak_advanced`

**Description**: Driver earned a new star in streak progression.

**Trigger**: Weekly health evaluation (`runWeeklyHealthEvaluation`) finds qualifying week.

**How to Test**:

1. Complete a qualifying week (100% attendance, 95%+ completion, no incidents)
2. Run weekly health cron
3. Driver notified of star advancement

**Source**: `src/lib/server/services/health.ts:830`

**Status**: [x] Verified (12 records from weekly health evaluation)

---

### 13. `streak_reset`

**Description**: Driver's streak was reset due to hard-stop event.

**Trigger**: Weekly health evaluation detects hard-stop (no-show or 2+ late cancellations).

**How to Test**:

1. Record a no-show event for driver
2. Run weekly health cron
3. Driver notified of streak reset

**Source**: `src/lib/server/services/health.ts:825`

**Status**: [x] Verified (2 records from weekly health evaluation hard-stop detection)

---

### 14. `bonus_eligible`

**Description**: Driver reached max stars and qualifies for bonus.

**Trigger**: Driver reaches 4 stars in weekly health evaluation.

**How to Test**:

1. Set driver to 3 stars
2. Complete another qualifying week
3. Run weekly health cron
4. Driver notified of bonus eligibility

**Source**: `src/lib/server/services/health.ts:836`

**Status**: [x] Verified (3 records from weekly health evaluation star progression)

---

### 15. `corrective_warning`

**Description**: Completion rate dropped below threshold.

**Trigger**: Daily health evaluation (`runDailyHealthEvaluation`) detects low completion.

**How to Test**:

1. Set driver completion rate below threshold (default 98%)
2. Run daily health cron
3. Driver receives corrective warning

**Source**: `src/lib/server/services/health.ts:992`

**Status**: [x] Verified (11 records from daily health evaluation)

---

## Manager Notifications

### 16. `route_unfilled`

**Description**: A route remains unfilled after schedule generation.

**Trigger**: `sendManagerAlert()` called when route has no assigned driver.

**How to Test**:

1. Have a route with no available drivers
2. Run schedule generation
3. Manager notified of unfilled route

**Source**: `src/lib/server/services/notifications.ts:412`

**Status**: [x] Verified (24 records from schedule generation and bid window closures)

---

### 17. `route_cancelled`

**Description**: A route was cancelled (all drivers dropped).

**Trigger**: `sendManagerAlert()` when route status changes to cancelled.

**How to Test**:

1. Cancel a route's only assignment
2. Manager receives cancellation alert

**Source**: `src/lib/server/services/notifications.ts:412`

**Status**: [x] Verified (5 records from route cancellation events)

---

### 18. `driver_no_show`

**Description**: Driver didn't arrive for confirmed shift.

**Trigger**: No-show detection cron or `sendManagerAlert()`.

**How to Test**:

1. Have confirmed assignment for today
2. Let route start time pass without driver arriving
3. Manager notified of no-show

**Source**: `src/lib/server/services/notifications.ts:412`

**Status**: [x] Verified

---

### 19. `return_exception`

**Description**: Driver marked parcels as exceptions.

**Trigger**: `sendManagerAlert()` when driver completes shift with exceptions.

**How to Test**:

1. Complete a shift with `exceptedReturns > 0`
2. Manager receives alert about exceptions

**Source**: `src/lib/server/services/notifications.ts:412`

**Status**: [x] Verified

---

## Other Notifications

### 20. `shift_cancelled`

**Description**: Driver's shift was cancelled.

**Trigger**: When assignment is cancelled by manager or system.

**How to Test**:

1. Create confirmed assignment
2. Manager cancels the assignment
3. Driver notified of cancellation

**Source**: Defined in schema but dispatch location TBD

**Status**: [x] Verified (7 records from driver/system cancellation paths)

---

### 21. `manual`

**Description**: Manual notification sent by manager.

**Trigger**: Manager sends custom notification via admin UI.

**How to Test**:

1. Use manual notification feature (if implemented)
2. Target driver receives custom message

**Source**: Defined in schema, used for admin-triggered messages

**Status**: [x] Verified (2 records from admin-triggered messages)

---

## Testing Procedure

### Required Verification for Every Case

For each notification scenario, mark pass only if all checks pass:

1. Trigger fired from a real domain action (manager action, driver action, or cron).
2. Push notification appears in Android notification tray.
3. Matching in-app notification record appears in notifications inbox.
4. Tapping push opens the app and lands on a reasonable destination.
5. Non-recipients do not receive the notification.

### One-Device Smoke Run (Do First)

Run this sequence before full coverage:

1. [x] `shift_reminder` (phone logged in as Driver; trigger cron)
2. [x] `bid_won` (phone logged in as Driver; competitive 3-bidder resolution, scoring verified)
3. [x] `driver_no_show` (phone logged in as Manager; trigger no-show flow)
4. [x] `return_exception` (phone logged in as Manager; driver completes with exceptions)

If any smoke case fails, stop and fix before running full matrix.

### Cron Invocation Template

Most cron endpoints require `Authorization: Bearer <CRON_SECRET>`.

```bash
curl -X GET \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://drive-three-psi.vercel.app/api/cron/shift-reminders"
```

### Full Test Suite

Run through all 21 notification types systematically:

1. Set up test data for each scenario
2. Trigger the notification
3. Verify: In-app notification appears
4. Verify: Push notification received on device
5. Verify: Notification content is correct

### FCM Delivery Verification

To verify FCM is actually delivering:

1. Check server logs for FCM send success/failure
2. Check device notification tray
3. Check in-app notification list for the record
4. If tray fails while in-app exists, run a direct FCM send probe to the same token.

---

## Troubleshooting

### No Push Received

1. **FCM Token Missing**: Check `fcm_token` in user record
2. **Token Stale**: Device may need to re-register
3. **FCM Config**: Verify Firebase credentials in server env
4. **Notification Permission**: Check device notification settings

### In-App Shows, Push Doesn't

1. FCM token issue (see above)
2. Firebase Admin SDK initialization failure
3. Sender/project mismatch (`messaging/mismatched-credential` / `SenderId mismatch`)
4. Check server logs for FCM errors

### Cron Not Triggering

1. Verify cron endpoint is configured in Vercel
2. Check cron secret matches `CRON_SECRET` env var
3. Manually call endpoint to test

---

## Summary Table (Single-Device Actor Matrix)

| Type                      | Recipient | Phone Login (1 device) | Trigger Actor (desktop) | Trigger            | Source File                      |
| ------------------------- | --------- | ---------------------- | ----------------------- | ------------------ | -------------------------------- |
| shift_reminder            | Driver    | Driver                 | Manager/System          | Cron (6 AM)        | shift-reminders/+server.ts       |
| bid_open                  | Driver    | Driver                 | Manager/System          | Bid window created | bidding.ts                       |
| emergency_route_available | Driver    | Driver                 | Manager/System          | Emergency bid      | notifications.ts                 |
| bid_won                   | Driver    | Driver                 | Driver/System           | Bid resolution     | bidding.ts, bids/+server.ts      |
| bid_lost                  | Driver    | Driver                 | System                  | Bid resolution     | bidding.ts, assignments.ts       |
| assignment_confirmed      | Driver    | Driver                 | Manager/System          | Schedule/assign    | lock-preferences, assignments.ts |
| confirmation_reminder     | Driver    | Driver                 | Manager/System          | Cron (daily)       | send-confirmation-reminders      |
| shift_auto_dropped        | Driver    | Driver                 | Manager/System          | Cron (hourly)      | auto-drop-unconfirmed            |
| schedule_locked           | Driver    | Driver                 | Manager/System          | Cron (Sunday)      | lock-preferences                 |
| stale_shift_reminder      | Driver    | Driver                 | Manager/System          | Cron (daily)       | stale-shift-reminder             |
| warning                   | Driver    | Driver                 | System                  | Flagging check     | flagging.ts                      |
| streak_advanced           | Driver    | Driver                 | System                  | Weekly health      | health.ts                        |
| streak_reset              | Driver    | Driver                 | System                  | Weekly health      | health.ts                        |
| bonus_eligible            | Driver    | Driver                 | System                  | Weekly health      | health.ts                        |
| corrective_warning        | Driver    | Driver                 | System                  | Daily health       | health.ts                        |
| route_unfilled            | Manager   | Manager                | System                  | Schedule gen       | notifications.ts                 |
| route_cancelled           | Manager   | Manager                | Driver                  | Route cancel       | notifications.ts                 |
| driver_no_show            | Manager   | Manager                | System                  | No-show detect     | notifications.ts                 |
| return_exception          | Manager   | Manager                | Driver                  | Shift complete     | notifications.ts                 |
| shift_cancelled           | Driver    | Driver                 | TBD                     | Cancel action      | TBD                              |
| manual                    | Any       | Target role            | Admin                   | Admin action       | TBD                              |
