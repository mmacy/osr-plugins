---
name: combat
description: Resolve OSE combat — initiative, attacks, damage, saving throws, morale, spells, and death. Use when combat begins or a combat handoff block is provided.
allowed-tools: WebFetch Bash AskUserQuestion Read Glob Edit
---

# Combat resolution for Old-School Essentials

Resolve combat step-by-step using SRD rules. Accepts the ENCOUNTER HANDOFF: COMBAT block from the encounter skill, or sets up combat manually.

## Core principles

The [referee's constitution](../referee/references/constitution.md) governs all behavior. Read it before beginning play if it is not already in context. Additionally:

1. **Look up rules from SRD** — read the SRD map or monsters submap to find the right file, then Read it
2. **Roll dice with roll.py** — use `uv run plugins/bx-referee/skills/referee/scripts/roll.py "<expr>"`
3. **Use AskUserQuestion** only for administrative setup. During combat, present the status and wait for the player to declare actions
4. **Update PARTY.md** — track HP changes, expended resources, and death in the adventure's `PARTY.md`

## Tool paths

- **Dice roller**: `plugins/bx-referee/skills/referee/scripts/roll.py`
- **SRD map**: `plugins/bx-referee/skills/referee/references/srd_map.md` (rules, classes, equipment, treasure)
- **SRD monsters**: `plugins/bx-referee/skills/referee/references/srd_monsters.md`
- **SRD spells**: `plugins/bx-referee/skills/referee/references/srd_spells.md`
- **SRD magic items**: `plugins/bx-referee/skills/referee/references/srd_magic_items.md`

## Input format

This skill accepts either:

1. **ENCOUNTER HANDOFF: COMBAT block** from the encounter skill — parse environment, distance, surprise state, party stat blocks, and monster stat blocks directly from the block
2. **Manual setup** via `$ARGUMENTS` (e.g., `/combat Goblin 3 dungeon 30`) — if arguments are missing, use **AskUserQuestion** to gather: monster type, count, environment, and starting distance

## Combat sequence

### Step 0: Setup

- Parse the combat handoff block (if present in conversation), or gather details via **AskUserQuestion**
- Read SRD rules: use the SRD map to find and Read `Combat.md`, `Combat_Tables.md`, `Morale_(Optional_Rule).md`
- Read the monster page: use the monsters submap to find the file path, then Read it

- Read party data from the active adventure's `PARTY.md` (determine adventure path from conversation context — the game root and adventure name are in SESSION.md)
- Roll monster HP individually using their HD (if not already rolled from handoff)
- Present the battlefield summary: who's fighting, distance, surprise state

### Step 1: Initiative

- Each side rolls 1d6 (group initiative per OSE rules)
- Surprised side loses first round (no actions)
- Ties: actions are simultaneous — both sides resolve before applying results
- Report initiative results

### Step 2: Round start — declare party actions

- Display current status block (see status tracking format below)
- Wait for the player to declare actions for their characters. Do not present a menu of options.
- Record all declared actions before resolving any

### Step 3: Movement phase

- Resolve movement for all combatants who declared movement
- Handle closing distance, retreating, positioning per `srd/Combat.md`

### Step 4: Ranged attacks

- Resolve all ranged attacks (bows, thrown weapons, ranged spells)
- Use the attack resolution procedure (see below)
- Resolve per attack resolution procedure below

### Step 5: Melee attacks

- Resolve per attack resolution procedure below

### Step 6: Spell resolution

- Resolve spells cast this round
- Fetch the spell's SRD page if needed:

Read the spells submap (`plugins/bx-referee/skills/referee/references/srd_spells.md`) to find the spell file, then Read it.

- Saving throws where applicable: roll 1d20 vs target number from character/monster save table
- Apply spell effects (damage, conditions, buffs)
- Track spell durations in ongoing effects

### Step 7: Monster actions

- Resolve monster attacks using the same attack resolution procedure
- Roll attacks and damage against PCs
- Apply special abilities (poison, breath weapon, etc. — fetch SRD as needed)
- **Morale check**: per `srd/Morale_(Optional_Rule).md` — check when first monster killed and when half incapacitated
- Report morale check results clearly

### Step 8: Ongoing effects

- Resolve any per-round effects: burning, poison, disease, spell durations, potion durations
- Decrement duration counters; remove expired effects
- Apply per-round damage (e.g., poison dealing damage each round)
- Check for saving throws triggered by ongoing effects
- Report effect changes: expired effects, damage dealt, conditions applied or removed

### Step 9: End of round / combat end

- Update and display the status block for all combatants
- Check end conditions:
  - All monsters dead or fled: **victory** — proceed to post-combat
  - All PCs dead or fled: **defeat**
  - Neither: display the status update and wait for the player to declare next round's actions. Loop to step 1
- Increment round counter

## Attack resolution procedure

Use the attack procedure from `srd/Combat.md` and the attack matrix from `srd/Combat_Tables.md`. For each attack:

1. Look up THAC0 and calculate target number
2. Roll 1d20: `uv run plugins/bx-referee/skills/referee/scripts/roll.py "1d20"`
3. Apply modifiers (STR for melee, DEX for ranged, magic, situational)
4. On hit, roll damage and subtract from target HP

## Spell and special ability handling

- When a PC casts a spell, fetch the relevant spell list page if not cached
- Apply spell effects exactly as described in the SRD
- Track spell slot expenditure — mark the slot as used
- Monster special abilities (poison, paralysis, breath weapons, etc.):
  - Fetch the monster SRD page for exact mechanics
  - Saving throws: roll 1d20 vs the appropriate save category and target number
  - Apply effects on failed save; note reduced/no effect on successful save

## Ongoing effects tracking

Each active effect has:

- **Source**: what caused it (spell name, poison, ability)
- **Target**: who is affected
- **Duration**: rounds remaining (or "until save" / "permanent")
- **Per-round effect**: damage, condition, or other mechanical impact

At the start of each round (step 8), process all active effects:

1. Apply per-round damage or effects
2. Check for saving throws (if effect allows repeated saves)
3. Decrement duration
4. Remove expired effects and announce their removal

## Status tracking format

Display this at the start of each round and at combat end:

```
## ROUND [n]
### Party
- [NAME] ([Class] [Level]): HP [current]/[max] | AC [value] | Att: [weapon] [damage] | EFFECTS: [list or none]

### Monsters
- [Type] #[n]: HP [current]/[max] | AC [value] | Att: [attacks] | EFFECTS: [list or none]
- [Type] #[n]: DEAD
```

Example:

```
## ROUND 3
### Party
- BLARG (Fighter 1): HP 5/7 | AC 1 | Att: sword 1d8+1
- SEDRA (Cleric 1): HP 3/4 | AC 4 | Att: mace 1d6 | EFFECTS: Bless (3 rds)

### Monsters
- Goblin #1: HP 1/3 | AC 6 | Att: sword 1d6 | EFFECTS: Poisoned (1d4/rd, 2 rds)
- Goblin #2: DEAD
- Goblin #3: HP 5/5 | AC 6 | Att: sword 1d6
```

## Post-combat

After combat ends in victory:

1. **Calculate XP**: Sum XP values of all defeated monsters (from SRD stat block)
2. **Treasure**: If the player searches the bodies, check the monster SRD entry for treasure and present what they find
3. **Award XP**: Split the total XP evenly among surviving PCs, then apply each PC's prime requisite XP bonus percentage. The bonus is already recorded on each character's stat line in PARTY.md as `(+N%)` or `(-N%)` after the XP-to-next-level value. Multiply the base share by this modifier and round down. Report both the base share and each PC's adjusted total.
4. **Update PARTY.md** using Edit tool:
   - Current HP (update `HP current/max`)
   - Expended spell slots or consumable items
   - XP gained (adjusted per-PC totals from step 3)
   - Dead PCs: append `| STATUS: DEAD` to their first line
5. **Level-up check**: After updating XP, check each surviving PC: if their new XP total ≥ the next-level threshold (the value after `/` in `XP current/next`), hand off to the character skill for advancement:
   - `Skill "character" "level-up <adventure-path>"` — pass the adventure directory path
   - Only one level gain per session is permitted. If XP would push a PC two or more levels, cap their XP at 1 below the threshold for the level after next (see `srd/Advancement.md`, "Maximum XP in One Session")
   - After the character skill returns, re-read `PARTY.md` for updated stats before continuing

## SRD page slugs reference

Core combat rules:

- `Combat`
- `Combat_Tables`
- `Morale_(Optional_Rule)`

Spell lists (fetch as needed):

- `Cleric_Spells`
- `Magic-User_Spells`

Monster pages use the monster name as slug (e.g., `Goblin`, `Ogre`, `Black_Dragon`).
