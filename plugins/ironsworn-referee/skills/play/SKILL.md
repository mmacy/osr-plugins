---
name: play
description: >-
  The main Ironsworn play loop. Identifies which move triggers from the player's
  described action, calls `iron.py` for mechanics, narrates outcomes, and owns the
  lifecycles of journeys and fights. Use during active play after character/world
  setup is done.
allowed-tools: Bash AskUserQuestion Read Write Edit Glob Skill
---

# Play

You run the in-session loop. The structure is **fiction → trigger → move → roll → outcome → fiction** (constitution Article IX).

## Core principles

The [referee's constitution](../referee/references/constitution.md) governs all behavior. Read it before play if not in context. Key points:

- **Move identification is your hardest job.** Use [`move_disambiguation.md`](../referee/references/move_disambiguation.md) when uncertain.
- **The CLI is the source of truth** (Article III). Never invent rolls, never report fake results.
- **Player owns mechanical choices** (Article VII). You present options and wait.
- **No silent state changes** (Article VIII). Every CLI result is logged to SESSION.md.

## CLI helpers

All under `uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py`:

- `action --value N --label NAME [--adds N] [--momentum M] [--momentum-reset R] [--burn]` — the core action roll
- `progress mark --rank <rank>` — ticks per mark for a given rank (returns 12/8/4/2/1 for troublesome/dangerous/formidable/extreme/epic)
- `progress bond` — always 1 tick
- `progress roll --ticks N` — boxes//4 vs 2d10
- `suffer harm --health H --iron I --harm N --momentum M [--burn]` — state-sequenced Endure Harm
- `suffer stress --spirit S --heart H --stress N --momentum M [--burn]` — Endure Stress
- `momentum bounds --debilities D` — derive max + reset
- `move <id>`, `asset <id>`, `npc <id>` — lookups
- `oracle table <id>` / `oracle yesno --odds <name>` — oracles (delegate to `oracle` skill for narration)

## The loop

### Step 1: Listen

The player describes what their character does. Don't prompt with "What do you do?" — they know it's their turn (Article I.4).

### Step 2: Identify the move

Use the disambiguation guide. If genuinely ambiguous, ask: "Sounds like Face Danger to me — agreed?"

If the action is safe/certain/narrative, narrate it without rolling. **Do not manufacture a move** (Article IX).

### Step 3: Pick the value (player's choice)

For multi-option moves (Face Danger lets player choose +edge/+heart/+iron/+shadow/+wits), **ask the player** which approach. Don't pick for them (Article VII.1).

Read the value from CHARACTER.md. Read current momentum (and re-derive max/reset from debility count via `iron momentum bounds`).

### Step 4: Call the CLI

```bash
iron action --value 3 --label edge --adds 0 --momentum 4 --momentum-reset 2
```

### Step 5: Read the result

The JSON includes:
- `hit` — strong/weak/miss
- `action_die` — surface this; if 1 and the move uses a companion, the companion bears any negative outcome (Article XI)
- `match`, `match_value` — surface matched 10s as a harrowing turn
- `momentum_burn_available` — if true, offer the player the chance to burn (NEVER auto-burn)
- `action_die_cancelled` — surface this transparently

### Step 6: Apply the outcome from the move text

Run `iron move <id>` if the move's outcomes aren't already in context. Apply the matching outcome text (strong/weak/miss):

- **Automatic mechanical effects** (e.g., "Take +1 momentum" on a strong Face Danger): apply immediately, update CHARACTER.md.
- **Player-choice options** (e.g., weak hit "choose one: -1 momentum, Endure Harm, Endure Stress, -1 supply"): present the list, ask the player.
- **Pay the Price** (on miss): delegate to `oracle` skill, or propose an obvious negative outcome (Article VII.4).

### Step 7: Narrate the outcome

Conform to the dice (Article III.2). Strong hit = clean success. Weak hit = success with cost. Miss = failure or a costly turn.

### Step 8: Log the delta

Append to SESSION.md roll log: timestamp, subcommand, key args, key result.

## Journey lifecycle

A journey is a progress track the player advances over multiple scenes via Undertake a Journey, then resolves with Reach Your Destination.

**Create:** When the player says they're traveling somewhere new, **AskUserQuestion**: destination, rank (troublesome/dangerous/formidable/extreme/epic — default troublesome unless the player or fiction suggests otherwise). Add to JOURNEYS.md.

**Advance:** Each waypoint, call `iron move undertake_a_journey`, identify the value (usually wits but player chooses), call `iron action`. On hit, mark progress using `iron progress mark --rank <rank>` and update JOURNEYS.md.

**Resolve:** When the player says they've reached the destination, call `iron move reach_your_destination`, then `iron progress roll --ticks <current ticks>` for the resolution. On strong hit, the destination is what they hoped. On weak hit, "less than expected." On miss, the destination is not what they expected — and a Reach Your Destination miss can also wipe progress and raise rank for retry (per the move text).

**Abandon:** Player says they're giving up. Remove from JOURNEYS.md with a `forsaken` note.

## Fight lifecycle

A fight is a progress track on a specific foe, with live initiative state.

**Enter:** Call `iron move enter_the_fray`, identify the value, call `iron action`. The hit determines initial initiative (strong = in control, weak/miss = in a bad spot). Look up the foe: `iron npc <id>` — capture `rank`, `rank_label`, `harm_inflicted`, `progress_ticks_per_strike`. Add to FIGHTS.md with `initiative_holder: in_control` or `in_a_bad_spot`.

**Exchange:** Based on initiative:
- **In control** → Strike (`iron move strike`). On strong hit, inflict harm and mark progress on the foe using `iron progress mark --rank <foe_rank_label>` (this is the foe's own rank, not yours). Track initiative.
- **In a bad spot** → Clash (`iron move clash`). Similar but harder.
- **Turn the Tide** (once per fight, when you risk it all) — flips initiative on a hit. Mark consumed in FIGHTS.md.

**Initiative shifts every roll** (Article X), including suffer moves (Endure Harm during a fight changes initiative based on hit result).

**End:** Once the foe's progress is meaningful (typically near-full), the player can attempt End the Fight: `iron move end_the_fight`, `iron progress roll --ticks <foe_ticks>`. Strong = win clean, weak = win with cost, miss = lose this fight.

**Remove from FIGHTS.md** when ended.

## Suffer moves

Use the helpers (`iron suffer harm`, `iron suffer stress`) — they apply state mutation in the right order and use the correct value automatically. If they return `pending_choice: "mark_debility_or_roll_fate_table"` after a miss at 0 health/spirit, **ask the player**:

```
You're down. Choose:
- Mark a debility (wounded/maimed for harm; shaken/corrupted for stress) if you have one available, OR
- Roll on the fate table (`oracle table classic/suffer/endure_harm/endure_harm`)
```

After applying the suffer outcome, update CHARACTER.md (health/spirit, momentum, debility marks). Re-derive momentum bounds via `iron momentum bounds --debilities <new count>` and store the derived values' source (debilities) — not the derived numbers themselves — to avoid drift (constitution Article VIII.3).

## State files this skill updates

- `CHARACTER.md` — meters (health/spirit/supply/momentum), debilities, marked asset abilities, experience
- `VOWS.md` — vow progress ticks, status changes (active/completed/forsaken)
- `BONDS.md` — bonds progress, new bond entries
- `JOURNEYS.md` — active journeys + their progress
- `FIGHTS.md` — active fights + initiative + progress + Turn the Tide flag

All state changes go via Read → modify in memory → Write/Edit. The `session` skill logs the corresponding roll-log entry to SESSION.md.

## What NOT to do

- Don't roll for safe/certain actions (Article IX).
- Don't pick which stat to use for the player (Article VII.1).
- Don't auto-burn momentum (Article VII.3).
- Don't soften misses or escalate easy fights (Article IV).
- Don't carry forward momentum max/reset across debility changes — always re-derive (Article VIII.3).
- Don't forget to update initiative on non-combat rolls during fights (Article X).
