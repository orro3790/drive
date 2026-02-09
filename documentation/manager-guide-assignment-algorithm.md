# How Drive Assigns Shifts: A Manager's Guide

---

## How This Document Is Organized

1. **The Weekly Schedule** — How drivers get assigned to routes automatically
2. **When Someone Drops** — How the bidding system fills open shifts
3. **Shift Confirmation** — Why drivers must confirm, and what happens if they don't
4. **Driver Health & Reputation** — How driver quality is tracked and rewarded
5. **Edge Cases & Scenarios** — Real situations and how the system handles them

---

## 1. The Weekly Schedule

Every week, Drive automatically generates a schedule for **two weeks ahead**. The system looks at each route, each day, and tries to match drivers based on their preferences.

### How a Driver Gets Assigned

For each route on each day, the system asks:

1. **Does the driver want to work this day?** (They set their preferred days.)
2. **Does the driver want this route?** (They pick up to 3 preferred routes.)
3. **Are they under their weekly limit?** (Default: 4 days/week.)
4. **Are they in good standing?** (Not flagged for performance issues.)

If multiple drivers qualify, the system picks the one with:

- The most experience on that specific route (first priority)
- The best delivery completion rate (second priority)
- The best attendance rate (third priority)

If **no one** qualifies for a route on a given day, that slot is marked **unfilled** and a bidding window opens automatically.

### Weekly Limits

| Driver Level                                 | Max Days/Week                           |
| -------------------------------------------- | --------------------------------------- |
| Standard                                     | 4                                       |
| High performer (20+ shifts, 95%+ attendance) | 6                                       |
| Flagged (performance issue)                  | Reduced by 1 per infraction (minimum 1) |

### Preference Lock Timing

- Drivers can change their preferred days and routes **up to Sunday at 11:59 PM Toronto time**
- After that, preferences are locked and the schedule generates
- New schedules always cover 2 weeks out

> **Scenario: "Why didn't Marcus get scheduled?"**
>
> Marcus prefers Monday, Wednesday, and Friday. He prefers Routes A, B, and C. But Route A on Monday already went to Priya (who has 15 completions on that route vs. Marcus's 3). Route B on Wednesday went to Jin (same reason). And by Friday, Marcus already hit his 4-day cap from other assignments. Result: Marcus doesn't appear on next week's schedule at all. He can still pick up shifts through bidding.

---

## 2. When Someone Drops: The Bidding System

When a shift becomes open — whether from a cancellation, a no-show, or an unfilled slot — Drive opens a **bid window** so other drivers can claim it. There are three modes, and the system picks the right one automatically.

### Competitive Bidding (More Than 24 Hours Before the Shift)

When there's time, the system runs a **scored competition**:

- The window stays open until 24 hours before the shift
- Any eligible driver can place a bid
- When the window closes, the **highest-scoring** bidder wins

**How Bids Are Scored:**

| Factor            | Weight | What It Measures                                                                   |
| ----------------- | ------ | ---------------------------------------------------------------------------------- |
| Health Score      | 45%    | Overall reliability — attendance, delivery completion, no late cancellations       |
| Route Familiarity | 25%    | How many times the driver has completed this specific route (maxes out at 20 runs) |
| Seniority         | 15%    | How long the driver has been with us (maxes out at 12 months)                      |
| Route Preference  | 15%    | Whether this route is in the driver's top 3 preferred routes                       |

**If scores are tied**, the driver who bid first wins.

> **Scenario: "Why did Ava beat Ravi?"**
>
> Route 7 opened up for next Thursday. Both Ava and Ravi bid on it.
>
> - Ava: Health 82/96, 12 completions on Route 7, 8 months tenure, Route 7 is her #2 preference
>   - Score: (82/96 × 0.45) + (12/20 × 0.25) + (8/12 × 0.15) + (1 × 0.15) = 0.38 + 0.15 + 0.10 + 0.15 = **0.78**
> - Ravi: Health 90/96, 3 completions on Route 7, 11 months tenure, Route 7 is NOT in his top 3
>   - Score: (90/96 × 0.45) + (3/20 × 0.25) + (11/12 × 0.15) + (0 × 0.15) = 0.42 + 0.04 + 0.14 + 0.00 = **0.60**
>
> Ava wins despite Ravi having a higher health score. Her experience on the route and her stated preference for it pushed her ahead. The system rewards drivers who know the route and actively want it.

### Instant Assignment (Less Than 24 Hours Before the Shift)

When there's less than a day until the shift, speed matters more than scoring:

- **First driver to accept gets the shift** — no waiting, no scoring
- The window stays open until the shift starts (7:00 AM)
- All eligible drivers are notified

### Emergency Mode (Urgent Situations)

Triggered when:

- A driver no-shows at 9:00 AM (detected automatically)
- A manager manually opens an emergency window

Emergency mode works like instant (first to accept wins), but:

- Drivers see a **"Priority Route Available"** notification
- An optional **pay bonus** can be attached (default +20%)

> **Scenario: "9 AM No-Show"**
>
> It's 9:05 AM and Darius hasn't arrived for Route 3. The system automatically:
>
> 1. Marks Darius as a no-show
> 2. Opens an **emergency bid window** for Route 3
> 3. Sends "Priority Route Available" to all eligible drivers with +20% bonus
> 4. First driver to tap "Accept" gets the route immediately
>
> If nobody accepts by end of day, the manager is alerted.

### What Happens When Nobody Bids

| Situation                                | System Response                                                     |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Competitive window closes, zero bids     | Automatically transitions to instant mode (first-come-first-served) |
| Instant window closes, nobody accepted   | Manager receives an alert for manual intervention                   |
| Emergency window closes, nobody accepted | Manager receives an alert                                           |

### Same-Day Conflict Protection

A driver **cannot be assigned two routes on the same day**. The system enforces this:

- During competitive resolution: if the highest-scoring bidder already has a shift that day, they're skipped and the next-highest bidder wins
- During instant assignment: if the driver tapping "Accept" already has a shift that day, they see an error message

> **Scenario: "Double-Booking Prevention"**
>
> Kenji already has Route 5 on Tuesday. Route 2 on Tuesday opens for bidding. Kenji bids and scores highest. But the system sees he's already assigned Tuesday, skips him, and gives the route to the second-highest bidder (Lin). Kenji's bid is marked as lost. This happens silently — no error, no confusion, just fair resolution.

---

## 3. Shift Confirmation

Every scheduled shift must be **manually confirmed** by the driver. This is mandatory.

### The Confirmation Window

| Milestone         | Timing                                                |
| ----------------- | ----------------------------------------------------- |
| **Window opens**  | 7 days before the shift                               |
| **Reminder sent** | 3 days before the shift (72 hours)                    |
| **Deadline**      | 48 hours before the shift                             |
| **Auto-drop**     | If not confirmed by deadline, the shift is taken away |

### What Auto-Drop Looks Like

If a driver doesn't confirm by 48 hours before:

1. The assignment is cancelled (marked as `auto_drop`)
2. A bid window opens for the now-empty route
3. The driver receives a notification that their shift was dropped
4. Their health score takes a **-12 point hit**

> **Scenario: "Forgot to Confirm"**
>
> Tanya is scheduled for Route 4 next Wednesday. She receives a reminder notification on Sunday. She doesn't confirm. Monday at 7:00 AM (48 hours before Wednesday's 7:00 AM shift), the system auto-drops her assignment. Route 4 goes to bidding. Tanya loses 12 health points. A replacement driver picks it up through competitive bidding.

> **Scenario: "Confirmed Then Cancelled Late"**
>
> Omar confirms his Thursday shift on Monday. On Wednesday evening, he cancels due to a family emergency. Because he already confirmed, this counts as a **late cancellation**. His health score takes a **-48 point hit** (much worse than an auto-drop). If this is his second late cancellation in 30 days, he enters **hard-stop** status and is removed from the assignment pool until a manager reinstates him.

---

## 4. Driver Health & Reputation

Every driver has a **health score** (0-100) and a **star rating** (0-4). These are visible to the driver and affect their bidding competitiveness.

### How Points Are Earned and Lost

| Action                                           | Points  |
| ------------------------------------------------ | ------- |
| Confirmed shift on time                          | +1      |
| Arrived on time                                  | +2      |
| Completed the shift                              | +2      |
| High delivery rate (95%+)                        | +1      |
| Picked up a shift via competitive bid            | +2      |
| Picked up an urgent/emergency shift              | +4      |
| **Auto-drop (didn't confirm)**                   | **-12** |
| **Late cancellation (confirmed then cancelled)** | **-48** |

A perfect shift earns **+6 points** (confirm + arrive + complete + high delivery). Picking up extra shifts through bidding earns bonus points.

### Stars (Weekly Streak)

Stars are earned by having **qualifying weeks**. To qualify, the driver needs:

- 100% attendance (showed up for every assigned shift)
- 95%+ delivery completion rate
- Zero no-shows
- Zero late cancellations

Each qualifying week adds 1 star (max 4). Non-qualifying weeks don't change the star count. But a **hard-stop event** (no-show or 2+ late cancellations in 30 days) **resets stars to zero**.

### Hard-Stop: The Serious Consequence

A driver enters hard-stop when:

- They no-show (don't arrive by 9:00 AM), **OR**
- They accumulate 2+ late cancellations in any 30-day window

Hard-stop means:

- Health score capped at 49 (can't compete effectively in bidding)
- Stars reset to 0
- **Removed from the assignment pool** — they won't be scheduled
- Only a **manager can reinstate them**

> **Scenario: "The Spiral"**
>
> Week 1: Jada cancels a confirmed shift (late cancel, -48 pts). Her health drops from 72 to 24.
> Week 2: Jada cancels another confirmed shift (second late cancel in 30 days).
> System response: Hard-stop activated. Jada is removed from the pool. Her stars reset to 0. She cannot be scheduled or bid on anything until a manager reviews her situation and reinstates her.
>
> After reinstatement, Jada starts rebuilding from a low score. She'll need several clean weeks to become competitive in bidding again.

> **Scenario: "The Comeback"**
>
> After reinstatement, Jada works 4 clean weeks straight: confirms on time, arrives on time, completes every delivery. She earns ~24 points per week (4 shifts × 6 pts). After 4 weeks, her score is back to 96. She's now competitive in bidding again and has earned 4 stars. The system rewarded her consistency.

### Why Health Score Matters for Bidding

In competitive bidding, health score is the **single biggest factor** (45% of the bid score). A driver with a high health score consistently wins bids over one with a low score — all else being equal. This is intentional: the system rewards reliable drivers with more opportunities.

However, once a driver crosses the 96-point threshold, additional health points don't help in bidding. At that level, **route familiarity** and **seniority** become the differentiators. This prevents a single "perfect" driver from winning every bid and gives experienced, route-specialist drivers a fair shot.

---

## 5. Edge Cases & Real Scenarios

### "The New Driver"

> **Situation**: Malik just signed up today.
>
> - He sets his preferred days and routes
> - He **won't be scheduled** for about 2 weeks (the schedule is already generated for the next 2 weeks)
> - He **can bid immediately** on any open shift
> - His health score starts at 0 and his bid score will be low, so he'll lose competitive bids to established drivers
> - His best strategy: pick up **instant and emergency shifts** (first-come-first-served, no scoring) to build experience and health points
> - After a few weeks of clean work, he'll start winning competitive bids

### "Route Specialist vs. All-Rounder"

> **Situation**: Route 9 opens for bidding.
>
> - **Specialist (Noor)**: Health 50, 20 completions on Route 9, 6 months, Route 9 is her preference
>   - Score: (50/96 × 0.45) + (20/20 × 0.25) + (6/12 × 0.15) + (1 × 0.15) = 0.23 + 0.25 + 0.075 + 0.15 = **0.71**
> - **All-Rounder (Trevor)**: Health 96, 0 completions on Route 9, 12 months, Route 9 NOT preferred
>   - Score: (96/96 × 0.45) + (0/20 × 0.25) + (12/12 × 0.15) + (0 × 0.15) = 0.45 + 0.00 + 0.15 + 0.00 = **0.60**
>
> Noor wins. Even though Trevor has a perfect health score and maximum seniority, Noor's deep familiarity with Route 9 and her preference for it give her the edge. **Knowing the route matters.**

### "Everyone's Busy"

> **Situation**: Route 6 on Friday opens for competitive bidding. Three drivers bid. At resolution time, all three already have a shift on Friday.
>
> The system skips all three and **transitions the window to instant mode**. Now any available driver can claim it first-come-first-served. If nobody claims it before 7:00 AM Friday, the manager is alerted.

### "The Last-Minute Emergency"

> **Situation**: It's 8:55 AM. Driver Chen was supposed to run Route 1 but hasn't arrived.
>
> At 9:00 AM, the no-show cron triggers:
>
> 1. Chen's assignment is flagged as a no-show (-48 health points for Chen if this leads to a hard-stop event)
> 2. Emergency bid window opens with +20% bonus
> 3. Every eligible driver gets "Priority Route Available" notification
> 4. At 9:03 AM, Priya taps Accept. She gets Route 1 immediately with the bonus.
>
> If Priya already had a shift today, she'd see "You already have a shift on this date" and someone else would need to accept.

### "Holiday Week — Nobody Wants to Work"

> **Situation**: It's a holiday week. Most drivers removed the day from their preferences before lock. The schedule generates with 7 out of 10 routes unfilled.
>
> - 7 competitive bid windows open automatically
> - If nobody bids within 24 hours, they transition to instant mode
> - If still nobody by shift day, manager is alerted for each unfilled route
> - Manager can manually assign drivers or open emergency windows with bonuses to incentivize coverage

### "Flagged Driver Tries to Bid"

> **Situation**: Jordan is flagged for low attendance. Can he still bid?
>
> **No.** Flagged drivers are excluded from bid window notifications and cannot be assigned. Jordan needs to work through his grace period (7 days) and improve his attendance above the threshold before regaining eligibility. If he doesn't improve, his weekly cap is reduced by 1 day.

---

## Quick Reference

| Rule                        | Value                                        |
| --------------------------- | -------------------------------------------- |
| Shift start time            | 7:00 AM Toronto                              |
| Arrival deadline            | 9:00 AM Toronto                              |
| Preference lock             | Sunday 11:59 PM Toronto                      |
| Schedule lookahead          | 2 weeks                                      |
| Confirmation window         | 7 days to 48 hours before shift              |
| Confirmation reminder       | 72 hours before shift                        |
| Auto-drop penalty           | -12 health points                            |
| Late cancel penalty         | -48 health points                            |
| Hard-stop trigger           | 1 no-show OR 2 late cancellations in 30 days |
| Competitive bidding cutoff  | 24 hours before shift                        |
| Emergency bonus (default)   | +20% pay                                     |
| Weekly cap (standard)       | 4 days                                       |
| Weekly cap (high performer) | 6 days                                       |
| Edit window after shift     | 1 hour to correct parcel counts              |

---

_Document version: February 2026. Based on Drive v1 dispatch policy._
