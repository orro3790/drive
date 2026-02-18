---
name: beads
description: "Beads task tracking system. TRIGGERS: user mentions 'beads', 'bv', 'beads viewer', 'backlog', 'what's next', 'next task', 'priorities', or asks about task planning/status. Covers analysis (bv --robot-*) and CRUD (bd)."
---

# Beads

On-demand algorithmic analysis of the beads backlog using `bv` (beads_viewer).

## Tool Usage: bd vs bv

| Tool     | Purpose                | Commands                                            |
| -------- | ---------------------- | --------------------------------------------------- |
| **`bd`** | CRUD operations        | `bd show`, `bd update`, `bd close`, `bd dep remove` |
| **`bv`** | Analysis & exploration | All `--robot-*` flags for insights                  |

**Rule**: Use `bv` for all analysis. Use `bd` only for fixing issues found (e.g., breaking cycles).

## When to Use

- Curating or reorganizing the backlog
- Identifying bottlenecks and critical path items
- Finding parallelizable work tracks
- Assessing project health and stale issues
- Deciding what to work on next

## Analysis Workflow

**Important:** Always run `bv` and `bd` commands from the main repo directory, not from worktrees:

```bash
cd C:/Users/matto/projects/drive && bv --robot-triage
```

This ensures the daemon is active and `issues.jsonl` stays in sync. Worktrees use "direct mode" which bypasses the daemon.

### 1. Get Unified Triage (Recommended First Step)

```bash
cd C:/Users/matto/projects/drive && bv --robot-triage | jq '{
  recommendations: .triage.recommendations[:3],
  alerts: .triage.project_health,
  quick_wins: .triage.quick_wins
}'
```

**Triage** = Single "what should I work on NOW?" combining priority, blockers, staleness, and impact.

### 2. Get Insights Overview

```bash
cd C:/Users/matto/projects/drive && bv --robot-insights | jq '{
  bottlenecks: .Bottlenecks[:5],
  keystones: .Keystones[:5],
  cycles: .Cycles
}'
```

**Bottlenecks** = Issues blocking the most downstream work (high betweenness centrality)
**Keystones** = Issues that many others depend on (high in-degree)

### 3. Get Execution Plan

```bash
cd C:/Users/matto/projects/drive && bv --robot-plan
```

Shows parallelizable tracks — work that can be done simultaneously without conflicts.

### 4. Visualize Dependencies

```bash
cd C:/Users/matto/projects/drive && bv --robot-graph --format=ascii
cd C:/Users/matto/projects/drive && bv --robot-graph --root=<epic-id> --format=ascii
```

### 5. Check Priority Score (for specific bead)

```bash
cd C:/Users/matto/projects/drive && bv --robot-priority <bead-id>
```

Graph-weighted priority that factors in blocking impact, not just P0-P4 label.

### 6. Check Alerts (proactive health)

```bash
cd C:/Users/matto/projects/drive && bv --robot-alerts
```

Surfaces stale issues, velocity drops, and blocking cascades.

### 7. Bead-to-Commit History

```bash
cd C:/Users/matto/projects/drive && bv --robot-history
cd C:/Users/matto/projects/drive && bv --bead-history <bead-id>
```

Correlates beads with git commits to understand code changes.

## Interpreting Results

| Metric           | Meaning                        | Action                              |
| ---------------- | ------------------------------ | ----------------------------------- |
| High betweenness | Bottleneck — blocks many paths | Prioritize to unblock parallelism   |
| High PageRank    | Central to project             | Important for overall progress      |
| Keystone         | Many dependents                | Completing unblocks multiple tracks |
| Cycle detected   | Circular dependency            | Break cycle with `bd dep remove`    |
| Stale alert      | No activity > threshold        | Review or close                     |
| Quick win        | Low effort, high impact        | Do first for momentum               |

## Output to User

After analysis, summarize:

1. Top 3 recommendations from triage (with reasons)
2. Any alerts requiring attention
3. Parallelizable work tracks available
4. Quick wins to build momentum
