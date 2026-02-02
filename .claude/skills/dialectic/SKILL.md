---
name: dialectic
description: Adversarial debate between two subagents for stress-testing architectural proposals. Use after drafting an implementation plan to surface blind spots through dialectical reasoning.
---

# Dialectic Protocol v2

Stress-test implementation plans through focused, parallel debates. Each architectural decision gets its own battle between a Proposer and Challenger. Battles run in parallel, then synthesize back to the main thread with full justification.

## When to Use

Invoke after drafting an implementation plan when you want:

- Stress-testing of architectural decisions
- Identification of blind spots and edge cases
- Exploration of simpler alternatives
- Challenge of foundational assumptions

## Invocation

```
/dialectic [optional: path to plan file]
```

If no path provided, use the most recent file in `ralph/plans/`.

---

## Architecture Overview

```
Main Thread (Opus)
│
├─ 1. Read plan, extract 3-5 focal points
│
├─ 2. Spawn Battle Orchestrators (parallel, in background)
│     ├─ Battle 1: Focal Point A → debates/point-1-{slug}.md
│     ├─ Battle 2: Focal Point B → debates/point-2-{slug}.md
│     └─ Battle 3: Focal Point C → debates/point-3-{slug}.md
│
├─ 3. Collect syntheses via TaskOutput (each ~300 words)
│
└─ 4. Present unified results to user (~1500 words total)
```

---

## Phase 1: Decomposition

You (main thread) extract focal points from the plan.

### 1.1 Read the Plan

Locate and read the implementation plan (argument path or most recent in `ralph/plans/`).

### 1.2 Extract Focal Points

Identify **3-5 architectural decisions** that are:

- Non-trivial (multiple valid approaches exist)
- Consequential (affects system behavior, complexity, or maintainability)
- Debatable (reasonable people could disagree)

Bad focal points: "Use Python" (obvious), "Add error handling" (too vague)
Good focal points: "Sync via message queue vs direct API calls", "Denormalize for read performance vs normalize for consistency"

### 1.3 Create Debate Directory

```bash
mkdir -p ralph/debates
```

### 1.4 Create Master Debate Log

Create `ralph/debates/MM-DD-HHMM-{plan-slug}-master.md`:

```markdown
# Dialectic Debate: {Plan Name}

**Plan:** {plan-file-path}
**Started:** {timestamp}
**Status:** In Progress

## Focal Points

1. {Focal point 1 - one sentence}
2. {Focal point 2 - one sentence}
3. {Focal point 3 - one sentence}

## Plan Context

{Paste the full plan here - this becomes shared context for all battles}

---

## Battle Results

{Will be filled in after battles complete}
```

---

## Phase 2: Parallel Battles

Spawn one **Battle Orchestrator** subagent per focal point. Run them in parallel using `run_in_background: true`.

### Battle Orchestrator Prompt Template

For each focal point, spawn a Task with:

- `model`: sonnet
- `subagent_type`: general-purpose
- `run_in_background`: true

````
You are a BATTLE ORCHESTRATOR running an adversarial debate on one architectural decision.

## Your Mission
Run a focused debate between a Proposer (defends the plan) and Challenger (plays devil's advocate) on ONE specific decision. Mediate 3-5 rounds, then synthesize the outcome.

## Full Implementation Plan (Context)
{paste the entire plan here}

## YOUR FOCAL POINT (Debate This Specifically)
{focal point N}: {one-sentence description}

## Battle Rules
1. Each round: Proposer speaks, then Challenger responds
2. Maximum 5 rounds (10 total responses)
3. Either side may concede by starting their response with "CONCEDE: {reason}"
4. Focus ONLY on the focal point - reference the broader plan only to support arguments
5. End early if either side concedes

## Debate File
Write the full debate transcript to: ralph/debates/point-{N}-{slug}.md

Use this format:
```markdown
# Battle {N}: {Focal Point Title}

**Focus:** {focal point description}
**Status:** In Progress

---

## Round 1

### Proposer
{proposer's opening argument - 200-300 words}

### Challenger
{challenger's response - 200-300 words}

---

## Round 2
...
````

## Running the Debate

For each round, you will prompt the Proposer and Challenger alternately.

### Proposer Prompt (use for each Proposer turn):

```
You are the PROPOSER defending an architectural decision.

## Full Plan Context
{plan}

## Decision Being Debated
{focal point}

## Challenger's Last Response
{challenger's previous response, or "N/A - Opening round" for round 1}

## Your Task
- Defend this specific decision from the plan
- Respond directly to challenges raised
- Concede specific points when the challenger is right
- If convinced on ALL major points, respond with: CONCEDE: {reason}
- Keep response focused: 200-300 words
```

### Challenger Prompt (use for each Challenger turn):

```
You are the CHALLENGER playing devil's advocate.

## Full Plan Context
{plan}

## Decision Being Debated
{focal point}

## Proposer's Last Response
{proposer's response from this round}

## Your Task
- Challenge assumptions and explore simpler alternatives
- Ask "Do we even need this?" before "Is this correct?"
- Surface edge cases and failure modes
- If ALL your concerns are addressed, respond with: CONCEDE: {reason}
- Keep response focused: 200-300 words
```

## After the Debate

Once the debate concludes (concession or max rounds), append a synthesis to the debate file and return it as your final output.

## CRITICAL: Your Return Value

Return ONLY the synthesis in this exact format (200-400 words total):

```markdown
## Synthesis: {Focal Point Title}

**Verdict:** {Proposer Conceded | Challenger Conceded | No Concession - {who had stronger arguments}}

**Core Tension:**
{2-3 sentences: What was the fundamental disagreement?}

**Arguments That Landed:**

- {Bullet 1: A specific argument that shifted the debate}
- {Bullet 2: Another key point}
- {Bullet 3: If applicable}

**What Changed:**
{2-3 sentences: How should the original plan be modified based on this debate? Be specific.}

**Caveat:**
{1 sentence: Any important nuance or condition that shouldn't be lost}
```

Do NOT return the full debate transcript - only the synthesis. The transcript is preserved in the debate file.

```

### Spawning Example

```

// Spawn all battles in parallel
Task(Battle 1, run_in_background=true) → task_id_1
Task(Battle 2, run_in_background=true) → task_id_2
Task(Battle 3, run_in_background=true) → task_id_3

```

---

## Phase 3: Collect Syntheses

After spawning all battles, use `TaskOutput` to collect results:

```

TaskOutput(task_id_1, block=true) → Synthesis 1
TaskOutput(task_id_2, block=true) → Synthesis 2
TaskOutput(task_id_3, block=true) → Synthesis 3

````

Each synthesis is ~300 words with full justification.

---

## Phase 4: Present Results

Update the master debate log with all syntheses, then present to the user.

### 4.1 Update Master Log

Append to `ralph/debates/MM-DD-HHMM-{plan-slug}-master.md`:

```markdown
---

## Battle Results

### Battle 1: {Focal Point 1}
{Paste Synthesis 1}

### Battle 2: {Focal Point 2}
{Paste Synthesis 2}

### Battle 3: {Focal Point 3}
{Paste Synthesis 3}

---

## Overall Recommendations

Based on the debates above:

1. **Keep as-is:** {decisions that survived challenge}
2. **Modify:** {decisions that need changes, with specifics}
3. **Reconsider:** {decisions that may need more thought}

## Debate Transcripts

Full transcripts available at:
- ralph/debates/point-1-{slug}.md
- ralph/debates/point-2-{slug}.md
- ralph/debates/point-3-{slug}.md
````

### 4.2 Summarize for User

Present a concise summary:

- Which decisions survived scrutiny
- Which decisions need modification (and how)
- Which decisions need more thought
- Link to master debate log for full justification

---

## Constraints

- Battle Orchestrators use `sonnet` for cost efficiency
- Each battle is isolated - no cross-battle context sharing
- Main thread receives only syntheses (~1500 words total), not full transcripts
- Full transcripts preserved in debate files for reference
- Maximum 5 rounds per battle - tighter focus, faster resolution

## File Structure

```
ralph/debates/
├── 01-07-1430-search-indexing-master.md    # Master log with all syntheses
├── point-1-architecture-choice.md          # Full transcript for battle 1
├── point-2-sync-strategy.md                # Full transcript for battle 2
└── point-3-data-model.md                   # Full transcript for battle 3
```
