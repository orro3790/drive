# Push Notification Testing Checklist

Complete checklist for verifying push notifications work end-to-end on Android (APK).

## Prerequisites

Before testing:

1. Android APK installed on device
2. Driver user account with FCM token registered
3. Manager user account for triggering certain notifications
4. Access to cron endpoints (for time-based notifications)

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

1. Create an assignment for today with `status = 'confirmed'`
2. Call the cron endpoint: `POST /api/cron/shift-reminders`
3. Verify push notification received

**Source**: `src/routes/api/cron/shift-reminders/+server.ts:159`

**Status**: [ ] Verified

---

### 2. `bid_open`

**Description**: A shift is available for bidding (competitive mode).

**Trigger**: When a bid window is created via `createBidWindow()` in competitive mode.

**How to Test**:

1. As manager, cancel an assignment >24h before shift date
2. System creates competitive bid window
3. Available drivers receive notification

**Source**: `src/lib/server/services/bidding.ts:427-428`

**Status**: [ ] Verified

---

### 3. `emergency_route_available`

**Description**: Urgent route available with bonus (emergency mode).

**Trigger**: Emergency bid window created (manager-triggered or no-show).

**How to Test**:

1. As manager, use "Trigger Emergency" on a route
2. Or: Let a confirmed driver no-show (cron detects it)
3. Available drivers receive notification

**Source**: `src/lib/server/services/bidding.ts:427`, `src/lib/server/services/notifications.ts:515`

**Status**: [ ] Verified

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

**Status**: [ ] Verified

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

**Status**: [ ] Verified

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

**Status**: [ ] Verified

---

### 7. `confirmation_reminder`

**Description**: Shift needs confirmation within 24 hours.

**Trigger**: Cron job `/api/cron/send-confirmation-reminders` runs daily.

**How to Test**:

1. Create assignment 72 hours from now, `status = 'scheduled'`
2. Run the cron endpoint
3. Driver receives reminder

**Source**: `src/routes/api/cron/send-confirmation-reminders/+server.ts:119`

**Status**: [ ] Verified

---

### 8. `shift_auto_dropped`

**Description**: Shift was dropped because driver didn't confirm in time.

**Trigger**: Cron job `/api/cron/auto-drop-unconfirmed` runs hourly.

**How to Test**:

1. Create assignment <48h from now, `status = 'scheduled'` (not confirmed)
2. Run the cron endpoint
3. Driver notified shift was dropped

**Source**: `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:158`

**Status**: [ ] Verified

---

### 9. `schedule_locked`

**Description**: Weekly schedule has been locked and generated.

**Trigger**: Cron job `/api/cron/lock-preferences` runs Sunday 11:59 PM.

**How to Test**:

1. Ensure driver has preferences set for upcoming week
2. Run the lock-preferences cron endpoint
3. All drivers with locked preferences receive notification

**Source**: `src/routes/api/cron/lock-preferences/+server.ts:128`

**Status**: [ ] Verified

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

**Status**: [ ] Verified

---

### 11. `warning`

**Description**: Driver flagged for attendance/performance issues.

**Trigger**: `checkDriverForFlagging()` detects poor metrics.

**How to Test**:

1. Create driver with <80% attendance (if <10 shifts) or <70% (if 10+ shifts)
2. Trigger flagging check via shift completion
3. Driver receives warning notification

**Source**: `src/lib/server/services/flagging.ts:197`

**Status**: [ ] Verified

---

### 12. `streak_advanced`

**Description**: Driver earned a new star in streak progression.

**Trigger**: Weekly health evaluation (`runWeeklyHealthEvaluation`) finds qualifying week.

**How to Test**:

1. Complete a qualifying week (100% attendance, 95%+ completion, no incidents)
2. Run weekly health cron
3. Driver notified of star advancement

**Source**: `src/lib/server/services/health.ts:830`

**Status**: [ ] Verified

---

### 13. `streak_reset`

**Description**: Driver's streak was reset due to hard-stop event.

**Trigger**: Weekly health evaluation detects hard-stop (no-show or 2+ late cancellations).

**How to Test**:

1. Record a no-show event for driver
2. Run weekly health cron
3. Driver notified of streak reset

**Source**: `src/lib/server/services/health.ts:825`

**Status**: [ ] Verified

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

**Status**: [ ] Verified

---

### 15. `corrective_warning`

**Description**: Completion rate dropped below threshold.

**Trigger**: Daily health evaluation (`runDailyHealthEvaluation`) detects low completion.

**How to Test**:

1. Set driver completion rate below threshold (default 98%)
2. Run daily health cron
3. Driver receives corrective warning

**Source**: `src/lib/server/services/health.ts:992`

**Status**: [ ] Verified

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

**Status**: [ ] Verified

---

### 17. `route_cancelled`

**Description**: A route was cancelled (all drivers dropped).

**Trigger**: `sendManagerAlert()` when route status changes to cancelled.

**How to Test**:

1. Cancel a route's only assignment
2. Manager receives cancellation alert

**Source**: `src/lib/server/services/notifications.ts:412`

**Status**: [ ] Verified

---

### 18. `driver_no_show`

**Description**: Driver didn't arrive for confirmed shift.

**Trigger**: No-show detection cron or `sendManagerAlert()`.

**How to Test**:

1. Have confirmed assignment for today
2. Let route start time pass without driver arriving
3. Manager notified of no-show

**Source**: `src/lib/server/services/notifications.ts:412`

**Status**: [ ] Verified

---

### 19. `return_exception`

**Description**: Driver marked parcels as exceptions.

**Trigger**: `sendManagerAlert()` when driver completes shift with exceptions.

**How to Test**:

1. Complete a shift with `exceptedReturns > 0`
2. Manager receives alert about exceptions

**Source**: `src/lib/server/services/notifications.ts:412`

**Status**: [ ] Verified

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

**Status**: [ ] Verified

---

### 21. `manual`

**Description**: Manual notification sent by manager.

**Trigger**: Manager sends custom notification via admin UI.

**How to Test**:

1. Use manual notification feature (if implemented)
2. Target driver receives custom message

**Source**: Defined in schema, used for admin-triggered messages

**Status**: [ ] Verified

---

## Testing Procedure

### Quick Smoke Test

Test the most common notifications first:

1. [ ] `shift_reminder` - Call cron with today's assignment
2. [ ] `bid_won` - Accept an instant bid
3. [ ] `assignment_confirmed` - Manager assigns via bid window
4. [ ] `confirmation_reminder` - Call cron with upcoming assignment

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
3. Check server logs for FCM errors

### Cron Not Triggering

1. Verify cron endpoint is configured in Vercel
2. Check cron secret matches `CRON_SECRET` env var
3. Manually call endpoint to test

---

## Summary Table

| Type                      | Recipient | Trigger            | Source File                      |
| ------------------------- | --------- | ------------------ | -------------------------------- |
| shift_reminder            | Driver    | Cron (6 AM)        | shift-reminders/+server.ts       |
| bid_open                  | Driver    | Bid window created | bidding.ts                       |
| emergency_route_available | Driver    | Emergency bid      | notifications.ts                 |
| bid_won                   | Driver    | Bid resolution     | bidding.ts, bids/+server.ts      |
| bid_lost                  | Driver    | Bid resolution     | bidding.ts, assignments.ts       |
| assignment_confirmed      | Driver    | Schedule/assign    | lock-preferences, assignments.ts |
| confirmation_reminder     | Driver    | Cron (daily)       | send-confirmation-reminders      |
| shift_auto_dropped        | Driver    | Cron (hourly)      | auto-drop-unconfirmed            |
| schedule_locked           | Driver    | Cron (Sunday)      | lock-preferences                 |
| stale_shift_reminder      | Driver    | Cron (daily)       | stale-shift-reminder             |
| warning                   | Driver    | Flagging check     | flagging.ts                      |
| streak_advanced           | Driver    | Weekly health      | health.ts                        |
| streak_reset              | Driver    | Weekly health      | health.ts                        |
| bonus_eligible            | Driver    | Weekly health      | health.ts                        |
| corrective_warning        | Driver    | Daily health       | health.ts                        |
| route_unfilled            | Manager   | Schedule gen       | notifications.ts                 |
| route_cancelled           | Manager   | Route cancel       | notifications.ts                 |
| driver_no_show            | Manager   | No-show detect     | notifications.ts                 |
| return_exception          | Manager   | Shift complete     | notifications.ts                 |
| shift_cancelled           | Driver    | Cancel action      | TBD                              |
| manual                    | Any       | Admin action       | TBD                              |
