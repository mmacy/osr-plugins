---
name: adventure
description: >-
  Manages OSE adventure lifecycle: set up new adventures from module
  PDFs, build party rosters, resume sessions with recaps, and save
  session state. Use when starting a new adventure, continuing an
  existing one, or saving/ending a session.
allowed-tools: WebFetch Bash AskUserQuestion Read Write Edit Glob Skill
---

# Adventure manager for Old-School Essentials

Manages the full adventure lifecycle: setting up new adventures from B/X module files (PDF or Markdown), resuming sessions with recaps, and saving state.

## Core principles

The [referee's constitution](../referee/references/constitution.md) governs all behavior. Additionally:

1. **PARTY.md is the canonical party data** — all character state lives here
2. **SESSION.md is the canonical session state** — timeline, exploration log, current situation
3. **Read the module file directly** — use the Read tool to access module content. For PDFs, use page ranges. For Markdown, read sections as needed.
4. **Use AskUserQuestion** only when a decision is required before play can continue

## Tool paths

- **Dice roller**: `plugins/bx-referee/skills/referee/scripts/roll.py`
- **SRD map**: `plugins/bx-referee/skills/referee/references/srd_map.md` (rules, classes, equipment, treasure)
- **SRD monsters**: `plugins/bx-referee/skills/referee/references/srd_monsters.md`
- **SRD spells**: `plugins/bx-referee/skills/referee/references/srd_spells.md`

## Game directory

The **game directory** (`<game-root>`) is passed as part of the arguments (e.g. `new /Users/player/osr-games`). If not provided, you **must** use **AskUserQuestion** to ask the player where their game files are stored before doing anything else. Do not search the filesystem for game files — always ask. Suggest `~/osr-games` as a default.

All `adventures/` and `characters/` paths are relative to this game root. Never write game files to the plugin cache directory.

## Workflow: New adventure

Triggered by `/adventure new` or routed from referee.

### Step 1: Module file

**AskUserQuestion**: path to the adventure module file (PDF or Markdown).

### Step 2: Adventure name

**AskUserQuestion**: adventure name (used as directory slug, e.g. `keep-on-borderlands`).

### Step 3: Create adventure directory

```bash
mkdir -p <game-root>/adventures/<name>
```

### Step 4: Read the module and build LOCATIONS.md

Read the module file to survey its structure. B/X modules typically have:

1. **Introductory pages** — player background, legends, setting, rumors table, NPC descriptions, referee notes. Record the page range.
2. **Keyed locations** — numbered locations like `1. MAIN GATE:`, `7a. TOWERS:`, `14a. THE CHAMBER OF THE MAGI`. Record each with its page number.

Format:

```markdown
# Location index

- **Module:** `<absolute path to the module file (PDF or Markdown)>`
- **Intro:** p. <start>-<end> or section name (player background, rumors, setting, NPCs)

## <Section name> (e.g., AREAS OF THE KEEP)

- 1. Main Gate (p. 8 or line/section ref)
- 2. Flanking Towers (p. 8)
- 3. Entry Yard (p. 8)
...
```

The module file path **must** be recorded at the top of LOCATIONS.md so that any skill can locate the source material during play.

This file helps with navigation during play. Include section groupings where the module uses them (e.g., `KEY TO TIER 1`, `PART 2: WEST WING`).

**Page number verification (PDF modules only):** PDF page numbers often differ from the printed page numbers in the book — cover pages, OGL pages, or front matter can shift everything by one or more pages. After building LOCATIONS.md, verify the page numbers are correct:

1. Pick 2-3 keyed locations spread across the module (e.g. first, middle, last)
2. Read each using the page number recorded in LOCATIONS.md
3. Confirm the expected room/location content actually appears on that page
4. If there is an offset (e.g. printed page 5 is actually PDF page 6), apply the correction to **every** page reference in LOCATIONS.md before proceeding

All page numbers in LOCATIONS.md must be **PDF page numbers** (the number you pass to the Read tool's `pages` parameter), not printed book page numbers.

### Step 5: Initialize PARTY.md

Write an empty party file:

```markdown
# Party
```

### Step 6: Build the party

Before creating new characters, check for existing ones:

1. **Check for existing parties.** Glob `<game-root>/adventures/*/PARTY.md` for parties from other adventures. If any exist, read each and build a list of candidates. Rank them by:
   - Most recently modified (suggests active play)
   - Party size appropriate for the module's recommended level/count
   - Characters that are alive (no `STATUS: DEAD`)
2. **Check for standalone characters.** Glob `<game-root>/characters/*.md` for individual character files.
3. **Present options via AskUserQuestion.** Offer choices based on what was found:
   - If existing parties were found: "Use [party name] from [adventure]?" — show the top candidate first with a brief roster summary (names, classes, levels)
   - If standalone characters were found: "Add existing characters to the party?"
   - Always include: "Create new characters"
4. **If using an existing party:** Copy the character blocks into this adventure's `PARTY.md`. Reset current HP to max and clear any temporary conditions — this is a fresh adventure.
5. **If creating new characters:** Ask how many, then call `Skill "character" "<game-root>"`. Append each completed character to `<game-root>/adventures/<name>/PARTY.md`.
6. **If mixing:** Allow the player to select some existing characters and create additional ones to fill out the party.

### Step 7: Initialize SESSION.md

Write from template (see SESSION.md format below), filling in:

- Adventure name
- Game root (absolute path to the game directory)
- Module file path (absolute path to the module file)
- Today's date
- **Current situation**: "The party has arrived at [adventure starting location]." — nothing more. Do NOT summarize module background, describe the environment, or include any DM-only information. The exploration skill will describe the scene when play begins.

### Step 8: Set the scene

This step is critical — it's the first thing the player experiences. Read the module's intro pages (recorded in LOCATIONS.md) and present the player-facing introductory material. Every module handles this differently:

- Some have an explicit "Players' Background" or "Players' Introduction" section — present it verbatim or as a faithful summary
- Some embed the player-facing hook in narrative or a preface — identify what the characters would know and present that
- Some have a rumors table — if present, roll on it per the module's instructions and share the results with the party. Some rumors are true, some false; present them without indicating which
- Some start at a dungeon entrance; others start in a town, a tavern, a prison cell, or in the middle of a crisis. Let the module dictate the opening situation

The goal is to give the player everything their characters would know at the start of the adventure — setting, hook, context — without revealing DM-only information. Then present the opening situation as the module describes it and stop.

Remember the constitution: describe the scene and stop. Do not narrate character actions.

### Step 9: Begin play

**MANDATORY**: Call `Skill "exploration"` now. Do not narrate exploration, describe rooms, resolve actions, or continue play without invoking the exploration skill first. The adventure skill's job ends here.

## Workflow: Resume adventure

Triggered by `/adventure continue` or routed from referee.

### Step 1: List adventures

The game root is passed as part of the arguments (e.g. `continue /Users/player/osr-games`). If not provided, you **must** use **AskUserQuestion** to ask the player for their game directory before proceeding. Do not search the filesystem.

Once you have the game root, Glob `<game-root>/adventures/*/SESSION.md` to find adventures with saved state.

**AskUserQuestion**: which adventure to continue?

### Step 2: Load state

Read `SESSION.md` and `PARTY.md` from the selected adventure directory.

### Step 3: Recap

Present a brief recap to the player:

- Current location
- Turn and hour
- Party status (HP, notable conditions)
- Last major event
- Current situation (from SESSION.md)

### Step 4: Resume play

**MANDATORY**: Call `Skill "exploration"` now. Do not narrate exploration, describe rooms, resolve actions, or continue play without invoking the exploration skill first. The adventure skill's job ends here.

## Workflow: Save session

Triggered by `/adventure save` or when the player asks to stop.

### Step 1: Update PARTY.md

Use Edit to sync current state:

- Current HP (as `HP current/max`)
- XP totals
- Equipment changes
- Expended spell slots
- Dead PCs: append `| STATUS: DEAD` to their first line

### Step 2: Update SESSION.md

Use Edit to add/update:

- Session log entry with date and summary
- Current situation — player-known state only (where the party is, what they've seen). Never write DM-only info like target numbers, hidden contents, or undiscovered module details

### Step 3: Confirm

Report what was saved: adventure name, location, turn, party status.

## SESSION.md format

```markdown
# Session state - <Adventure name>

## Adventure

- Game root: `<absolute path to game directory>`
- Module: `<absolute path to module file>`
- Started: <date>

## Party

See [PARTY.md](PARTY.md) for current roster and stats.

## Current status

- **Location:** [location-id] — [in-world name]
- **Turn:** [n] | **Hour:** [n]
- **Light:** [source] ([turns remaining])

## Session log

### Session 1 — <date>

[Summary: locations explored, encounters, treasure, notable events]

## Casualties

| Name | Class | Cause of death | Session |
| ---- | ----- | -------------- | ------- |

## Current situation

[Player-known state only: where the party is, what they can see. NEVER include DM-only info like target numbers, hidden contents, trap mechanisms, or module background the players haven't discovered yet.]
```

## PARTY.md format

```markdown
# Party

- BLARG | Fighter | Level 1 | Neutral | He/Him
  - STR 14 (+1) | INT 10 | WIS 11 | DEX 14 (+1) | CON 15 (+1) | CHA 11
  - AC 1 [18] | HP 7/7 | THAC0 19 [0] | XP 0/2,000 (+5%)
  - SAVES: Death 12 | Wands 13 | Paralysis 14 | Breath 15 | Spells 16
  - EQUIPMENT: Plate mail, shield, sword (1d8), dagger (1d4), torches x12, tinder box, backpack
  - MONEY: 10 gp, 2 sp
  - LANGUAGES: Common (broken), Neutral
```

- HP tracked as `current/max`
- Dead characters: append `| STATUS: DEAD` to their first line
- One blank line between character blocks

## Adventure directory structure

```
<game-root>/
├── adventures/<adventure-name>/
│   ├── LOCATIONS.md
│   ├── PARTY.md
│   └── SESSION.md
└── characters/
    └── <name>-<class>.md
```

The module file stays at its original location on disk. SESSION.md records both the game root and the module path.

## Error handling

- **Adventure directory already exists**: AskUserQuestion — overwrite, use existing, or choose new name?
- **Module file not found**: AskUserQuestion for correct path
