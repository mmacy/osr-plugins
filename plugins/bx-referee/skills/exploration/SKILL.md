---
name: exploration
description: >-
  Runs the OSE dungeon exploration turn loop: movement between keyed
  areas, wandering monster checks, resource tracking, searching,
  doors, and traps. Use when actively exploring a dungeon or
  wilderness location during an adventure.
allowed-tools: WebFetch Bash AskUserQuestion Read Edit Glob Skill
---

# Dungeon exploration for Old-School Essentials

Run the exploration turn loop for keyed module adventures. Each turn is 10 minutes of in-game time.

## Core principles

The [referee's constitution](../referee/references/constitution.md) governs all behavior. Read it before beginning play if it is not already in context. Additionally:

1. **Look up rules from SRD** — read the SRD map to find the right file, then Read it; roll dice with `roll.py`
2. **Use AskUserQuestion** only for administrative setup (marching order, light sources). During gameplay, describe the scene and wait — the player will type what they want to do

## Tool paths

- **Dice roller**: `plugins/bx-referee/skills/referee/scripts/roll.py`
- **SRD map**: `plugins/bx-referee/skills/referee/references/srd_map.md` (rules, classes, equipment, treasure)
- **SRD monsters**: `plugins/bx-referee/skills/referee/references/srd_monsters.md`
- **SRD spells**: `plugins/bx-referee/skills/referee/references/srd_spells.md`
- **SRD magic items**: `plugins/bx-referee/skills/referee/references/srd_magic_items.md`

```bash
uv run plugins/bx-referee/skills/referee/scripts/roll.py "1d6"
```

## Setup (on entry)

1. Determine the active adventure directory from conversation context. If not available, read the **game root** path from conversation context or **AskUserQuestion**, then Glob `<game-root>/adventures/*/SESSION.md`
2. Read `SESSION.md` — current location, turn, hour, **game root**, and the **module file path**
3. Read `PARTY.md` — cache party composition, HP, equipment, light sources, movement rates
4. Read `LOCATIONS.md` — available keyed locations with page/section references
5. Read the SRD Encounters page: `plugins/bx-referee/skills/referee/references/srd/Encounters.md`

6. If no marching order established: **AskUserQuestion** for marching order (front to back)

## Reading module content

The module file stays at its original location. SESSION.md records its path. To read a keyed location, use the Read tool with the reference from LOCATIONS.md:

- **PDF modules**: use the `pages` parameter (e.g. `pages: "8-9"`)
- **Markdown modules**: read the file and locate the relevant section

When moving to a new area, always read the relevant content before describing anything to the player.

## Per-turn sequence

Each turn follows this loop:

### 1. Wandering monster check

- Per `srd/Dungeon_Adventuring.md` (Wandering Monsters section)
- If triggered: consult the module's wandering monster table, roll on it, then call `Skill "encounter"` immediately — do not resolve the encounter yourself
- After encounter resolves: re-read `PARTY.md` to pick up HP/status changes, then resume

### 2. Party action

Wait for the player to state what they do. Do not offer a menu of actions. Common actions include movement, searching, listening, opening doors, interacting with features, and resting — but the player may attempt anything.

### Turn economy

A 10-minute turn covers a sequence of cautious exploration, not a single action. Multiple quick actions in the same area fit within one turn. Only advance the turn counter when the party does something that genuinely takes ~10 minutes.

**Consumes a full turn:**

- Movement through unexplored areas (up to base MV in feet, e.g. 120')
- Searching a 10'x10' area
- An encounter (including aftermath)
- Resting
- Extended activities specified by the module (e.g. "takes 2 turns to recover the oil")

**Free/quick actions within the current turn:**

- Opening or forcing a single door
- Climbing a short ladder or flight of stairs (within the same movement turn)
- Brief conversation or reporting to the party
- Examining something in plain sight
- Drawing a weapon, lighting a torch, drinking a potion
- Pulling a lever, pressing a button, picking up an item

### 3. Resolve action

**Movement:**

- Read the destination location from the module file
- Present the player-facing description only (read-aloud / boxed text)
- Keep DM notes, hidden features, and trap triggers hidden until relevant
- Check for monsters in the room — if present, call `Skill "encounter"` immediately — do not resolve the encounter yourself

**Search:**

- Check module text for hidden features in the current area
- Searching takes 1 full turn
- Use search and secret door rules from `srd/Dungeon_Adventuring.md`

**Listen at door:**

- Use listening rules from `srd/Dungeon_Adventuring.md`

**Doors:**

- Use door rules from `srd/Dungeon_Adventuring.md` (stuck, locked, closing behaviour)

**Cast a spell (non-combat):**

When a PC casts a spell outside of combat:

1. **Deduct spell slot**: Mark the spell slot as used in PARTY.md using Edit. If the PC has no remaining slots of the required level, the spell cannot be cast.
2. **Read spell details**: Use the spells submap (`plugins/bx-referee/skills/referee/references/srd_spells.md`) to find the spell file, then Read it. Note range, duration, area of effect, and saving throw.
3. **Saving throws** (if applicable): Roll 1d20 via `roll.py` against the target's save value. Do not reveal the target number (Article II). Narrate success or failure.
4. **Apply effect**: Resolve the spell's effect as described in the SRD page. Narrate the result.
5. **Track duration**: If the spell has a duration measured in turns, record it in SESSION.md. Decrement each turn in step 4 (Update tracking) and announce when it expires.

Casting a spell takes a full turn (the caster is concentrating on the ritual).

### 4. Update tracking

- Increment turn counter
- Decrement light source turns (see resource tracking table below)
- When light runs out: warn the player; see darkness rules in `srd/Hazards_and_Challenges.md`
- Track spell durations in turns where applicable
- Resting: per `srd/Dungeon_Adventuring.md` (Resting section)
- **Encumbrance**: when the party picks up treasure, drops items, or uses consumables (torches, oil, rations, potions), recalculate the affected PC's encumbrance and movement rate:
  - Coin weight: 1 cn per coin of any type
  - Treasure weight: per the treasure encumbrance table in `srd/Time%2C_Weight%2C_Movement.md` (gems 1 cn, jewellery 10 cn, potions 10 cn, etc.)
  - Update `ENC` and `MV` on the PC's stat block in PARTY.md using Edit
  - If encumbrance bracket changes, announce the new movement rate
  - Party movement rate is the slowest member's rate

### 5. Loop

Return to step 1.

## Encounter handoff

When monsters are encountered (wandering or room-based):

- Determine monster type and count from module text or wandering table
- `Skill "encounter" "<monster> <count> dungeon"`
- The encounter skill handles surprise, distance, reaction, and routes to combat if needed
- After resolution, re-read `PARTY.md` for updated state

## Resource tracking

| Resource | Duration | Notes |
| -------- | -------- | ----- |
| Torch | 6 turns | 30' radius light |
| Lantern | 24 turns | 30' radius light |
| Rest | After 24 turns | Party should rest 8 hours |
| Rations | 1 per day | Track food supply |

## Saving mid-exploration

If the player asks to save or stop: `Skill "adventure" "save"`

## SRD page slugs

- `Encounters` — encounter procedures, wandering monster frequency
- `Dungeon_Adventuring` — exploration procedures, doors, searching
- `Evasion_and_Pursuit` — fleeing rules
