---
name: session
description: >-
  Saves and resumes an Ironsworn campaign. Writes SESSION.md (game directory,
  campaign, timeline, roll log) and reloads it on resume. Use at session start,
  session end, and any time the player says "save" or "resume."
allowed-tools: Bash AskUserQuestion Read Write Edit Glob Skill
---

# Session save/resume

You manage `SESSION.md` — the canonical session state and roll log — and are the entry point for resuming an existing campaign.

## Core principles

The [referee's constitution](../referee/references/constitution.md) governs all behavior. Read it before play if not in context.

- **SESSION.md is the audit trail.** Every CLI call's inputs and outputs are logged here as deltas (Article VIII).
- **State files outside SESSION.md are owned by their respective skills.** `character` writes CHARACTER.md, BONDS.md. `world` writes TRUTHS.md. `play` writes/updates VOWS.md, JOURNEYS.md, FIGHTS.md, and CHARACTER.md meters.
- **You never invent state.** When resuming, read what's on disk and report it. Don't fill in plausible-looking values.

## Game directory

Passed in as the last argument. SESSION.md lives at `<game-root>/campaigns/<campaign-name>/SESSION.md`.

If the player says "resume" without specifying a campaign, run `ls <game-root>/campaigns/` and use **AskUserQuestion** with the list of campaign directories.

## Workflows

### Workflow 1: New session, new campaign

After `character` and `world` have written their files, you initialize SESSION.md:

```markdown
# Session log

## Campaign

- Game directory: <absolute path>
- Campaign: <campaign-name>
- Character: <character-name>

## Files

- CHARACTER.md
- VOWS.md
- BONDS.md
- TRUTHS.md
- (JOURNEYS.md, FIGHTS.md created when needed)

## Sessions

### Session 1 — <YYYY-MM-DD>

- Started: <timestamp>

## Roll log

(rolls will be appended below as they happen)
```

### Workflow 2: Resume an existing campaign

1. Read SESSION.md → identify the campaign, character, last session date.
2. Read CHARACTER.md, VOWS.md, BONDS.md, TRUTHS.md, and any JOURNEYS.md / FIGHTS.md that exist.
3. **Recap** in 3-5 sentences: who the character is, the active vow(s), the most recent unresolved situation. Pull from the most recent session's narrative entries in SESSION.md, not from inference.
4. Append a new session block:

```markdown
### Session N — <YYYY-MM-DD>

- Resumed: <timestamp>
- Recap: <the recap you presented to the player>
```

5. Hand control back to `referee`.

### Workflow 3: Save mid-session

When the player says "save":

1. Read all state files. Confirm they're consistent (CHARACTER.md meters reflect the latest roll log entries, VOWS.md progress matches what you've narrated).
2. Append a save marker to SESSION.md:

```markdown
- Save: <timestamp> — <one-line situation summary>
```

3. Confirm to the player: "Saved. Campaign state is at `<path>`."

### Workflow 4: End session

When the player says "end session" or "wrap up":

1. Save (as above).
2. Append a closing marker:

```markdown
- Ended: <timestamp>
```

3. Offer a brief 1-2 sentence "Where we left off" summary the player can use to remember next time.

## Roll log format

Every CLI call's input args and output JSON are appended to the "Roll log" section as a one-line delta. Format:

```markdown
- [<timestamp>] <subcommand> <key args> → <key result>
```

Examples:

```markdown
- [14:32:01] action label=edge value=3 adds=1 momentum=3 → strong hit (score 9 vs 4,8)
- [14:32:45] oracle yesno odds=likely roll=44 → yes (match)
- [14:35:10] suffer_harm health=3→0 spill=2 momentum=4→2 roll=miss → pending_choice
```

Keep entries terse — the full JSON is too verbose. Include enough to reconstruct the roll if needed.

## When to call this skill

- At the start of every session (new or resumed) — initiated by `referee`.
- When the player says "save" / "resume" / "end session."
- After every 5-10 rolls during play, write a brief narrative summary into the current session block (not the roll log) so the recap on the next resume has something to draw from.
