# ADR 003: Two-Week Lookahead Scheduling Model

## Status

Accepted

## Date

2026-02-02

## Context

Drivers need predictable schedules. The company needs reliable coverage. We need to balance driver flexibility with operational planning.

## Decision

### Preference Lock Cycle

```
Week N (current)     Week N+1 (next)      Week N+2 (following)
──────────────────   ──────────────────   ──────────────────
Executing scheduled  Already locked       Preferences open
assignments          (generated last      for modification
                     Sunday)
```

**Lock deadline**: Sunday 23:59 Toronto time

When Sunday rolls over to Monday:

1. All driver preferences are frozen
2. Algorithm generates Week N+2 schedule using locked preferences
3. Drivers are notified of their new assignments
4. Preference editing reopens for Week N+3

### New Driver Handling

```
Wed: Driver signs up, sets preferences
     ↓
Sun: Preferences locked, used for Week N+2 schedule
     ↓
Mon (Week N+1): Driver cannot take scheduled shifts yet
                BUT can bid on spontaneous openings
     ↓
Mon (Week N+2): Driver's scheduled shifts begin
```

New drivers see an info banner: "Your scheduled shifts will begin [date]. You can take open shifts in the meantime."

### Driver Input

- **Preferred days**: Which days of week they want to work (Mon-Sun checkboxes)
- **Preferred routes**: Top 3 routes they prefer (from route list)
- **Weekly cap**: System-enforced (4 default, 6 for high performers)

### Schedule Generation Algorithm

For each day in Week N+2:

1. Get all routes that need assignment
2. For each route:
   - Find drivers who:
     - Prefer this day
     - Prefer this route (or have familiarity)
     - Under weekly cap
     - Not flagged
   - Sort by: route familiarity → completion rate → attendance rate
   - Assign top driver
   - If no eligible driver: mark route as unfilled (triggers bid window)

## Rationale

### Why 2 weeks ahead?

- Gives company reliable forecasting
- Drivers know their schedule well in advance
- Enough buffer for replacement if cancellations happen
- Standard industry practice for shift work

### Why Sunday lock?

- Weekend gives drivers time to review/modify preferences
- Monday start aligns with typical operational week
- Clear, consistent deadline everyone can remember

### Why sticky route preferences?

- Drivers become experts on specific routes
- Better service quality
- Reduces cognitive load for both drivers and system

## Consequences

### Positive

- Predictable schedules for drivers
- Reliable coverage forecasting
- Clear rules everyone understands
- Automatic optimization based on preferences

### Negative

- New drivers wait up to 2 weeks for scheduled shifts
- Changes after lock require manual manager override
- Edge cases around holidays/special dates need handling

### Future Considerations

- Holiday schedule overrides (manager can unlock specific weeks)
- Vacation/PTO requests (driver marks weeks unavailable)
- Seasonal route changes (company adds/removes routes)
