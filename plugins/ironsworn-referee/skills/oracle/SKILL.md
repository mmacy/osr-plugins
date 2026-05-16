---
name: oracle
description: >-
  Rolls Ironsworn oracle tables (Action, Theme, Pay the Price, Settlement Name,
  etc.) and the Ask the Oracle yes/no oracle. A thin wrapper over `iron.py oracle`.
  Use when the player asks the oracle a question, needs inspiration, or invokes Pay
  the Price.
allowed-tools: Bash Read Skill
---

# Oracle

You roll oracle tables and the yes/no oracle, surface raw results, and let the agent or player interpret.

## Core principles

The [referee's constitution](../referee/references/constitution.md) governs all behavior. Read it before play if not in context.

- **Show raw results first.** The player must see the roll value and the row text before any interpretation (Article II + Article VI).
- **Never re-roll, ignore, or pre-filter results.** If you don't like the roll, that's still the roll.
- **Sub-rolls are real.** If the CLI returns `subrolls`, all of them apply.

## CLI helpers

- Yes/no: `uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py oracle yesno --odds <odds>`
- Table: `uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py oracle table <id>`
- List all oracle ids: `uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py list oracles`

## Oracle ID format

IDs are namespaced like `classic/action_and_theme/action`, `classic/place/region`, `classic/fate/pay_the_price/pay_the_price`. Use the full ID with the CLI — short slugs are not supported.

Common IDs:

| What | ID |
|---|---|
| Action verb | `classic/action_and_theme/action` |
| Theme noun | `classic/action_and_theme/theme` |
| Character role | `classic/character/role` |
| Character goal | `classic/character/goal` |
| Character descriptor | `classic/character/descriptor` |
| Place: region | `classic/place/region` |
| Place: location | `classic/place/location` |
| Place: descriptor | `classic/place/descriptor` |
| Settlement name (root) | `classic/settlement/name/<sub>` (creature, environmental_aspect, …) |
| Settlement trouble | `classic/settlement/trouble` |
| Turning point: combat action | `classic/turning_point/combat_action` |
| Turning point: major plot twist | `classic/turning_point/major_plot_twist` |
| Turning point: challenge rank | `classic/turning_point/challenge_rank` |
| Mystic backlash | `classic/turning_point/mystic_backlash` |
| Pay the Price | `classic/fate/pay_the_price/pay_the_price` |
| Endure Harm fate | `classic/suffer/endure_harm/endure_harm` |
| Endure Stress fate | `classic/suffer/endure_stress/endure_stress` |
| Names: ironlander (by letter) | `classic/name/ironlander/<a-z>` |
| Names: elf | `classic/name/elf` |
| Names: giants | `classic/name/other/giants` |
| Names: trolls | `classic/name/other/trolls` |
| Names: varou | `classic/name/other/varou` |

Run `iron list oracles` for the complete list at runtime.

## Yes/No (Ask the Oracle)

Use when the player asks a question with a true/false answer ("Is the door locked?" "Does the captain trust me?").

**AskUserQuestion** or use judgment to pick the odds. Five levels (rulebook p. 23, p. 107):

| Odds | Yes if roll ≥ | Probability |
|---|---|---|
| almost_certain | 11 | 90% |
| likely | 26 | 75% |
| 50_50 | 51 | 50% |
| unlikely | 76 | 25% |
| small_chance | 91 | 10% |

If the player doesn't specify, use 50_50.

```bash
uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py oracle yesno --odds likely
```

Output:

```json
{ "roll": 27, "yes": true, "match": false, "threshold": 26 }
```

Surface the raw roll and yes/no before narrating. If `match: true`, the rulebook (p. 24) suggests "an extreme result or twist has occurred" — surface the match flag to the player and incorporate the twist.

## Table roll

```bash
uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py oracle table classic/action_and_theme/action
```

Output:

```json
{ "id": "...", "dice": "1d100", "roll": 50, "text": "Transform" }
```

Surface the raw roll and text, then interpret. Combine multiple oracle rolls when useful — Action + Theme is the classic combo for generating a discovery, event, or NPC goal.

### Sub-rolls

Some rows direct sub-rolls (e.g., Pay the Price 99–00 = "Roll twice more"). The CLI returns these as a `subrolls` array; surface every sub-roll's text. They all apply.

## Pay the Price

The Pay the Price move (rulebook p. 105) has two forms (per Article VII):

1. **Propose the obvious negative outcome** from the fiction — if the consequence is clear, surface it ("the bridge collapses — the bandits cut you off") and apply.
2. **Roll on the table** when no obvious outcome exists or the player asks for the oracle to decide.

Whichever path you take, **say which path you took**. If you rolled, show the raw roll and row text.

**Row 1–2 special behavior:** the row text instructs a manual re-roll ("Roll again and apply that result but make it worse. If you roll this result yet again, think of something dreadful…"). Reroll once, narrate the next result as worse. If 1–2 lands again, the agent narrates something dreadful (do not recurse a third time).

**Row 99–00:** the CLI handles this automatically via sub-rolls. Both results apply; if both rolls yield the same row, make it worse.

## Endure Harm / Endure Stress fate tables

These are embedded oracles at `classic/suffer/endure_harm/endure_harm` and `classic/suffer/endure_stress/endure_stress`. The `suffer harm/stress` CLI helpers do NOT auto-roll these — when the helper returns `pending_choice: "mark_debility_or_roll_fate_table"`, the player chooses (Article VII). If they choose to roll, this skill is the entry point.

## Workflow summary

1. Player asks a question or invokes the oracle.
2. Identify the right oracle ID (or pick odds for yes/no).
3. Call the CLI.
4. **Surface the raw roll and text** (constitution Article II).
5. Interpret into fiction OR offer the player the chance to interpret first.
6. The interpretation gets logged to SESSION.md by the `session` skill, alongside the raw CLI output.
