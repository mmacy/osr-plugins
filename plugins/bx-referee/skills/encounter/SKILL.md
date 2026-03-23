---
name: encounter
description: Resolve OSE encounters — surprise, distance, reaction, monster stats, flee/evasion, parley. Use when the party encounters monsters or another entity.
allowed-tools: WebFetch Bash AskUserQuestion Read Glob
---

# Encounter resolution for Old-School Essentials

Resolve encounters step-by-step using SRD rules, from surprise through reaction and non-combat resolution. Hands off to a combat skill if fighting starts.

## Core principles

The [referee's constitution](../referee/references/constitution.md) governs all behavior. Additionally:

1. **Look up rules from SRD** — read the SRD map or monsters submap to find the right file, then Read it
2. **Roll dice with roll.py** — use `uv run plugins/bx-referee/skills/referee/scripts/roll.py "<expr>"`
3. **Use AskUserQuestion** only for administrative setup. During gameplay, narrate the situation and wait for the player to respond

## Tool paths

- **Dice roller**: `plugins/bx-referee/skills/referee/scripts/roll.py`
- **SRD map**: `plugins/bx-referee/skills/referee/references/srd_map.md` (rules, classes, equipment, treasure)
- **SRD monsters**: `plugins/bx-referee/skills/referee/references/srd_monsters.md`
- **SRD spells**: `plugins/bx-referee/skills/referee/references/srd_spells.md`

```bash
uv run plugins/bx-referee/skills/referee/scripts/roll.py "2d6"
```

## Input format

The GM invokes with `/encounter <monster> <count> <environment>`, e.g. `/encounter Goblin 3 dungeon`. Arguments are available as `$ARGUMENTS`. If any are missing, use **AskUserQuestion** to prompt for them.

- **Monster type** (`$0`): SRD monster name (e.g., "Goblin", "Ogre")
- **Count** (`$1`): Number of monsters, or "random" to roll from SRD range
- **Environment** (`$2`): **dungeon** or **wilderness**

## Encounter sequence

### Step 0: Preparation

- Read SRD rules: use the SRD map to find and Read `Encounters.md`, `Evasion_and_Pursuit.md`, `Morale_(Optional_Rule).md`
- Read the monster page: use the monsters submap to find the file path, then Read it

- Read party data from the active adventure's `PARTY.md` (determine adventure path from conversation context — the game root and adventure name are in SESSION.md)

### Step 1: Present monster stats

- Roll HP individually for each monster using their HD
- Present a compact stat block (see format below)
- **AskUserQuestion**: Confirm encounter details (monster count, environment)

### Step 2: Surprise

- Follow the surprise procedure in `srd/Encounters.md` (Surprise section)
- Check monster SRD entry for special surprise rules
- Report results clearly

### Step 3: Encounter distance

- Determine distance per environment rules in `srd/Encounters.md` (Encounter Distance section)
- Report the distance

### Step 4: Reaction roll

- Only roll if monster reaction is not predetermined (some monsters always attack)
- Use the reaction table in `srd/Encounters.md` — roll 2d6, apply CHA modifier
- Narrate the monsters' demeanor based on the result and wait for the player to respond

### Step 5: Flee/evasion

If the party chooses to flee:

- Compare party movement rate (lowest in party) to monster movement rate
- If party is faster: automatic escape
- If monsters are faster: check evasion chance by party size (from Evasion_and_Pursuit SRD page)
- If the player drops food or treasure, monsters check morale to see if they stop to collect it
- If evasion succeeds: encounter over
- If evasion fails: combat handoff (step 7)

### Step 6: Parley

If the party chooses to parley:

- The player states what they say or offer
- Make an additional reaction roll, modified by the quality/relevance of the offer
- Report the monster response
- If parley succeeds: encounter resolved
- If parley breaks down: narrate the breakdown and wait for the player to respond
- If fight: combat handoff (step 7)
- If flee: go to step 5

### Step 7: Combat handoff

Output a structured handoff block for the future combat skill:

```
## ENCOUNTER HANDOFF: COMBAT
**Environment:** [dungeon/wilderness], [terrain if wilderness]
**Distance:** [distance] feet
**Surprise:** [which side, if any, and rounds remaining]
**Party:**
[stat blocks from characters/ files]
**Monsters:**
[stat blocks with rolled HP]
**Notes:** [any relevant conditions — surprise, lighting, terrain]
```

## Monster stat block format

Present monster stats in this compact format:

```
## GOBLIN x3
- AC 6 [13] | HD 1-1 (hp: 3, 5, 2) | Att 1 weapon | Dmg 1d6
- MV 60' (20') | ML 7 | Save D1 | AL Chaotic | XP 5 each
- SPECIAL: -1 to hit in sunlight. Hate dwarves.
```

Notes:

- Roll HP individually per monster using their HD
- Include both descending and ascending AC
- Only include SPECIAL line if the monster has notable abilities
- Use the exact values from the SRD page

## SRD page slugs reference

Core encounter rules:

- `Encounters`
- `Evasion_and_Pursuit`
- `Morale_(Optional_Rule)`

Encounter tables (fetch as needed):

- `Dungeon_Encounters`
- `Wilderness_Encounters`

Monster pages use the monster name as slug (e.g., `Goblin`, `Ogre`, `Black_Dragon`).
