# DRV-v83.3 Shift Lifecycle Journey Verification (Mobile)

Date: 2026-02-13
Bead: `DRV-v83.3`

## Scope

- Viewport: `390x844` (mobile)
- Primary account(s): `judah_lueilwitz64@driver.test`, `delta.schulist70@driver.test`
- Journeys covered:
  1. Confirm shift
  2. Arrive -> Start -> Complete -> Edit
  3. Cancel future confirmed shift
  4. Place bid
  5. Notifications read + mark all read
- Edge cases covered:
  - 9 AM arrival cutoff
  - Edit-window expiry
  - Offline write guard messaging

## Journey Results

| Journey                             | Result                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirm shift                       | PASS                           | `documentation/verification/screenshots/DRV-v83.3/journey1-confirm-before.png`, `documentation/verification/screenshots/DRV-v83.3/journey1-confirm-after.png`                                                                                                                                                                                                                                        |
| Arrive -> Start -> Complete -> Edit | PASS (with defect noted below) | `documentation/verification/screenshots/DRV-v83.3/journey2-arrive-before.png`, `documentation/verification/screenshots/DRV-v83.3/journey2-after-arrive.png`, `documentation/verification/screenshots/DRV-v83.3/journey2-after-start.png`, `documentation/verification/screenshots/DRV-v83.3/journey2-after-complete.png`, `documentation/verification/screenshots/DRV-v83.3/journey2-after-edit.png` |
| Cancel future confirmed shift       | PASS                           | `documentation/verification/screenshots/DRV-v83.3/journey3-cancel-before.png`, `documentation/verification/screenshots/DRV-v83.3/journey3-cancel-after-success.png`                                                                                                                                                                                                                                  |
| Place bid                           | PASS                           | `documentation/verification/screenshots/DRV-v83.3/journey4-bid-before-delta.png`, `documentation/verification/screenshots/DRV-v83.3/journey4-bid-after-delta.png`                                                                                                                                                                                                                                    |
| Notifications read + mark all read  | PASS                           | `documentation/verification/screenshots/DRV-v83.3/journey5-notifications-before.png`, `documentation/verification/screenshots/DRV-v83.3/journey5-notifications-after.png`                                                                                                                                                                                                                            |

## Edge-Case Checks

- **9 AM arrival cutoff:** PASS (API returns `400` with `"Arrival cutoff is 09:00 Toronto time"` when tested after cutoff).
- **Edit window expiry:** PASS (API returns `400` with `"Edit window has expired"` outside edit window).
- **Offline guard messaging:** PASS (offline banner appears: `"You're offline. Some features are unavailable."`; write action is blocked).

## Defects Found (for DRV-v83.4)

### [MEDIUM] Untranslated shift summary key appears after edited completion

- **Location:** Driver dashboard completed-shift summary after edit
- **Expected:** Human-readable localized label for excepted returns
- **Actual:** Literal token text renders (`shift_complete_summary_excepted`)
- **Evidence:** `documentation/verification/screenshots/DRV-v83.3/journey2-after-edit.png`

### [LOW] Cancellation confirmation UX has delayed state resolution

- **Location:** Schedule cancellation modal
- **Expected:** Immediate close/feedback after confirmation
- **Actual:** Confirm button disables, then UI settles after a noticeable delay before final cancelled state is shown
- **Evidence:** `documentation/verification/screenshots/DRV-v83.3/journey3-cancel-after-success.png`

## Overall Verdict

`WARN`

All five lifecycle journeys execute successfully on mobile in this run, and required edge cases were checked. A medium-severity localization defect and a low-severity cancellation UX delay were found and should be triaged in `DRV-v83.4`.
