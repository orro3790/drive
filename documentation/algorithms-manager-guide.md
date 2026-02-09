# Drive Algorithms Guide for Managers

## Why this document exists

Drive uses automation to keep routes covered without forcing managers to manually triage every shift change.

This guide explains, in plain English:

1. What each algorithm does.
2. What it optimizes.
3. When manager intervention is required.
4. How the new Driver Health model is intended to work.

---

## One-minute summary

Drive has multiple algorithms working together:

1. **Assignment algorithm**: plans upcoming shifts.
2. **Open shift auction algorithm**: resolves competition when multiple drivers bid.
3. **Emergency recovery algorithm**: fills routes quickly when a no-show happens.
4. **Driver health algorithm**: scores reliability and quality, then shows progress toward incentives.

Managers still have final authority. Automation handles normal cases; managers handle exceptions.

---

## Algorithm catalog (manager view)

| Algorithm                    | Status                | What it decides                           | Main goal                                                    | Manager control                            |
| ---------------------------- | --------------------- | ----------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| Assignment planning          | Live                  | Who gets pre-scheduled routes             | Keep routes covered with reliable matches                    | Can override assignments manually          |
| Open shift auction           | Live                  | Which bidder wins an open shift           | Fill gaps with strongest available driver                    | Can bypass algorithm and assign directly   |
| Emergency recovery           | Live                  | Who gets day-of urgent routes             | Restore coverage fast to avoid service failure               | Can trigger emergency route manually       |
| Driver health and incentives | Designed (next phase) | Reliability/quality score and progression | Incentivize dependable behavior and improve coverage quality | Managers retain unflag/reinstate authority |

---

## Driver-facing language (clarity rule)

For drivers, we use:

- **Open Shifts** (not internal jargon)
- **Place Bid** (explicit action)

This keeps the concept understandable while preserving internal bidding logic.

---

## Driver Health model (plain English)

### What changes for drivers

Instead of giving most dashboard space to raw stats only, drivers will see:

1. A **Health Score** (0-100).
2. A **4-star streak tracker** (weekly progression).
3. A clear explanation of what helped or hurt the score.
4. A visible next milestone and incentive target.

Note on current wording: the existing dashboard label "Completed" refers to completed **shifts**, not completed parcels. Health card copy should make this distinction explicit.

### What managers get from this

1. Better behavior incentives without constant manual coaching.
2. Earlier warning before reliability drops become operational failures.
3. A transparent, repeatable rule set (not ad-hoc judgment calls).

---

## Driver Health policy decisions (locked)

These decisions were agreed for the next implementation phase:

1. **Daily score updates + weekly star updates**.
2. **Hard-stop behavior**: score is capped below healthy range if severe reliability events occur.
3. **No-show rule**: one no-show triggers immediate hard-stop effects.
4. **Late cancellation rule**: two late cancellations in a rolling 30-day window triggers hard-stop effects.
5. **Late cancellation definition**: cancellation within 48 hours of shift.
6. **Reinstatement**: manager intervention required (no automatic reinstatement).
7. **Weekly star progression requires strict quality**:
   - 100% attendance
   - completion >= 95%
   - 0 no-shows
   - 0 late cancellations
8. **No-assignment week is neutral** (does not increase or reset streak).
9. **Star demotion is immediate reset** on hard-stop events.
10. **Incentive preview**: unlock at 4 stars -> +10% bonus preview (simulation).

---

## Concise algorithm summary (weights + rationale)

### A) Open shift auction score (already live)

When multiple drivers bid for the same open shift, score components are:

- **Completion rate: 40%**
- **Route familiarity: 30%**
- **Attendance rate: 20%**
- **Route preference bonus: 10%**

Rationale: delivery quality first, then route experience, then reliability, then preference fit.

### B) Driver Health score (next phase, manager-facing summary)

Initial model is reliability-first, with hard-stop overrides:

- **Attendance component: 50 points**
- **Completion component: 30 points**
- **Consistency/reliability component: 20 points**

Hard-stop events (no-show, or late-cancel threshold breach) cap the score below healthy range for that period.

Additional guardrail:

- **Completion below 80%** enters corrective status.
- If not recovered within one week, policy recommends reduced shift access until recovery.

Rationale: operational continuity matters most. A route must be covered and completed reliably, not just averaged out by good weeks.

---

## Transparency and governance principles

All algorithms should follow these rules:

1. **Transparent outputs**: show drivers why they are progressing or blocked.
2. **Policy-backed thresholds**: constants live in one policy module, not scattered magic numbers.
3. **Manager override remains available** for exceptional cases.
4. **Auditability**: major state changes should be traceable.
5. **Progressive rollout**: simulation first, automation later once validated.

---

## Important implementation note

The new health-and-gamification layer is intended to launch as **UI + simulation first**.

That means:

- Drivers can see score/stars/incentive progress.
- Managers can monitor projected outcomes.
- Automatic pay-rate changes are deferred until policy validation is complete.
