# Shift Confirmation & Replacement System

## Overview

This document describes how Drive ensures every route has a driver, even when drivers don't show up. The system uses mandatory confirmations, automated bidding, and emergency fill procedures to minimize vacant routes.

---

## How It Works

### 1. Schedule Assignment (2 Weeks Out)

Every Sunday night, the system assigns drivers to routes for two weeks from now based on their preferences. Multiple drivers may want the same route, so the system picks the best fit based on reliability, familiarity with the route, and attendance history.

**What drivers see**: A notification that they've been assigned shifts for the upcoming week.

### 2. Mandatory Confirmation (7 Days to 48 Hours Before Shift)

Once assigned, every driver must manually confirm each shift. They can confirm up to one week before the shift, and must confirm no later than 48 hours before.

- **72 hours before**: The driver receives a reminder notification to confirm.
- **48 hours before**: If still unconfirmed, the driver is automatically removed from the shift and the route opens up for other drivers.

**Why mandatory confirmations**: The old system assumed drivers would show up unless they cancelled. In practice, many simply didn't show up. By requiring a confirmation, we catch unreliable commitments 48 hours in advance instead of discovering them the morning of the shift.

### 3. Bidding Window (48 to 24 Hours Before Shift)

When a shift opens up (driver didn't confirm or cancelled), other drivers can bid to take it. During this first 24-hour window, multiple drivers can bid. The system scores each bid based on:

- Delivery completion rate (40%)
- Familiarity with that specific route (30%)
- Attendance record (20%)
- Whether they originally requested that route (10%)

At the 24-hour mark before the shift, the highest-scoring bidder wins and is notified.

**Why scored bidding**: Giving the route to the most qualified driver improves delivery quality and reduces the chance of a second no-show.

### 4. First-Come-First-Served (24 to 0 Hours Before Shift)

If no one bids during the competitive window, the system switches to first-come-first-served. The first driver to accept gets the route immediately. There's no waiting or scoring at this point.

**Why the switch**: With less than 24 hours to go, filling the route fast matters more than finding the perfect driver.

### 5. Emergency Routes (Day Of, After 9 AM)

If a driver confirmed their shift but doesn't arrive by 9:00 AM, the system automatically:

- Removes the driver from the route
- Opens an emergency bid window
- Sends notifications to all drivers who aren't currently on a shift
- Offers a 20% pay bonus as an incentive

The first driver to accept gets the route immediately. Managers can also manually trigger this process at any time.

**Why 9 AM**: Drivers must signal their on-site arrival before 9 AM. This gives enough time to find a replacement while still getting deliveries out the same day.

**Why 20% bonus**: Last-minute routes are disruptive to drivers' plans. The bonus compensates for the inconvenience and incentivizes quick acceptance.

---

## Driver Shift Workflow (Day Of)

When a driver arrives for their shift, they go through these steps:

1. **Signal arrival** — Press "I'm On Site" (must be before 9 AM)
2. **Count parcels** — Enter how many packages they're starting with
3. **Make deliveries** — Go about their day
4. **Report returns** — Enter how many packages they're bringing back
5. **Review summary** — See their delivery count (calculated automatically)
6. **Finish shift** — Lock in the results

If a driver makes a mistake entering their parcel counts, they have **1 hour** after finishing to edit the numbers. After that, the shift is locked and they'd need to contact a manager.

**Why this workflow**: Every step is timestamped and creates an audit trail. We know exactly when someone arrived, how many parcels they handled, and what they returned. This data feeds into the reliability metrics that determine future shift assignments.

---

## What Gets Tracked

The system records several metrics for each driver:

| Metric             | What It Measures                                               |
| ------------------ | -------------------------------------------------------------- |
| Confirmation rate  | How often they confirm shifts on time vs. getting auto-dropped |
| Attendance rate    | Shifts completed vs. shifts assigned                           |
| Completion rate    | Deliveries made vs. parcels received                           |
| Late cancellations | Confirmed shifts cancelled within 48 hours                     |
| No-shows           | Confirmed but didn't arrive by 9 AM                            |
| Bid pickups        | Shifts picked up through bidding (shows initiative)            |

These metrics are used for:

- Deciding who gets assigned routes (more reliable drivers get priority)
- Scoring bids when multiple drivers want the same open route
- Flagging drivers whose reliability drops below thresholds

---

## The Safety Net (Fallback Chain)

The system has multiple layers to prevent vacant routes:

1. **48 hours out** — Unconfirmed drivers auto-dropped, competitive bidding opens
2. **24 hours out** — If no bidders, switches to first-come-first-served
3. **9 AM day-of** — If confirmed driver doesn't arrive, emergency route with bonus
4. **Manager override** — Manager can manually create emergency routes at any time
5. **Final fallback** — If still unfilled, manager is alerted to handle manually

---

## Architectural Decisions (Brief)

**Why 48-hour confirmation window, not 24?**
Gives enough time to run a full competitive bidding cycle (24h) before falling back to first-come-first-served. A 24-hour window would leave no time for scored bidding.

**Why not just let managers assign replacements?**
Automation is faster and more consistent. Managers are notified at every step and can override, but the system handles the common cases without human intervention.

**Why track confirmations separately from attendance?**
A driver who never confirms is different from one who confirms and doesn't show up. The second is worse (we planned around them being there). Tracking separately lets us weight these behaviors differently in the future.

**Why a 1-hour edit window instead of unlimited edits?**
Prevents after-the-fact manipulation of delivery numbers while still allowing honest mistakes to be corrected quickly.

**Why first-come-first-served for emergencies instead of scoring?**
Speed is the priority. When a route needs filling day-of, the first available driver is better than waiting for the "best" driver.
