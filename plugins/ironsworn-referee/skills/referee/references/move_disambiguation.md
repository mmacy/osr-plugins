# Move disambiguation

Identifying which move a player's described action triggers is the agent's hardest job in Ironsworn. The dice math is deterministic; the fiction-to-move mapping is judgment. This file is the agent's heuristic guide.

## The loop

Fiction → trigger → move → roll → outcome → fiction. Start from the fiction, find the matching trigger, then call `iron move <id>` to load the move's structure if not already in context.

## Adventure moves (Ironsworn rulebook p. 60–68)

| Player describes... | Likely move |
|---|---|
| Anything risky with imminent threat | **Face Danger** |
| Preparing, assessing, gathering advantage | **Secure an Advantage** |
| Investigating, asking around, studying | **Gather Information** |
| Tending wounds in a safe moment | **Heal** |
| Restocking gear, food, ammunition | **Resupply** |
| Setting camp in the wilds | **Make Camp** |
| Traveling between waypoints | **Undertake a Journey** |
| Arriving at a journey's end | **Reach Your Destination** |

**Face Danger vs Secure an Advantage** is the most common ambiguity. The litmus: "Am I doing the risky thing now, or am I preparing to do it?" Drawing a bow to shoot a guard → Face Danger. Climbing a wall to flank a guard → Secure an Advantage. If the player conflates the two, ask.

## Relationship moves (p. 69–77)

| Player describes... | Likely move |
|---|---|
| Persuading, intimidating, bargaining | **Compel** |
| Resting in a community | **Sojourn** |
| Initiating a duel | **Draw the Circle** |
| Strengthening a bond formally | **Forge a Bond** |
| Calling on a bond for aid | **Test Your Bond** |
| Helping an ally in their move | **Aid Your Ally** |
| Ending a relationship arc | **Write Your Epilogue** |

**Forge a Bond** marks the shared bonds track (always 1 tick; see `iron progress bond`). It is *not* tied to a specific person's progress — there's one shared track per character.

## Combat moves (p. 78–85)

| Player describes... | Likely move |
|---|---|
| Combat begins | **Enter the Fray** |
| Attacking with initiative (in control) | **Strike** |
| Attacking without initiative (in a bad spot) | **Clash** |
| Trying to flip initiative once per fight | **Turn the Tide** |
| Going for the killing blow | **End the Fight** |
| Resolving a large-scale battle abstractly | **Battle** |

**Strike vs Clash** is purely about initiative state. Read `FIGHTS.md` before identifying.

**End the Fight** is only legal after a decisive action lands AND the foe's progress is meaningful (full or close). It uses the foe's progress track value vs 2d10. Do not call End the Fight on a fresh foe.

**Turn the Tide** is once per fight. If `FIGHTS.md` shows it consumed, don't allow it again until the fight ends.

## Suffer moves (p. 90–97)

| Trigger | Move | CLI helper |
|---|---|---|
| Physical damage | **Endure Harm** | `iron suffer harm` |
| Mental/emotional damage | **Endure Stress** | `iron suffer stress` |
| Companion takes harm | **Companion Endure Harm** | (no helper in v0.1; use `iron move companion_endure_harm` + manual `iron action`) |
| Resource exhaustion (supply at 0, harm/stress at limits) | **Face Desolation**, **Out of Supply**, **Face a Setback** | manual `iron action` |

The two `iron suffer` helpers apply state mutation (harm to health/spirit, spill to momentum) BEFORE the roll, and use `max(new_value, second_stat)` automatically. On a miss at 0 health/spirit, they return `pending_choice: "mark_debility_or_roll_fate_table"` for the player to decide.

## Quest moves (p. 98–103)

| Player describes... | Likely move |
|---|---|
| Swearing a new vow | **Swear an Iron Vow** |
| Making meaningful progress toward a vow | **Reach a Milestone** |
| Attempting to finally fulfill a vow | **Fulfill Your Vow** |
| Abandoning a vow | **Forsake Your Vow** |
| Spending experience on a new asset | **Advance** |

Reach a Milestone is the player's call. Don't mark vow progress just because a scene felt heroic — the player decides when a milestone has been reached.

## Fate moves (p. 104–107)

| Use when... | Move | CLI |
|---|---|---|
| You suffer a move's outcome (consequence needed) | **Pay the Price** | `iron oracle table classic/fate/pay_the_price/pay_the_price` |
| You need a yes/no answer about the fiction | **Ask the Oracle** (yes/no) | `iron oracle yesno --odds <name>` |
| You need an inspirational prompt | **Ask the Oracle** (any table) | `iron oracle table <id>` |

For Pay the Price, you may either (per the move's text) propose the most obvious negative outcome from the fiction OR roll on the table. Either is legitimate; always reveal which path was taken (Article VII).

## Action die 1 + companion

When a move uses a companion's ability (the move came from an asset like Wolf or Bannersworn) and the CLI returns `action_die: 1`, any negative outcome of the move falls on the companion (Article XI). Surface this automatically. If the consequence is harm, suggest invoking Companion Endure Harm next.

## When no move fits

The Ironsworn loop is **fiction → trigger → move → fiction**. If the player describes something that isn't risky, isn't a quest action, isn't combat, isn't a relationship move — narrate it without rolling. Don't manufacture a move (Article IX).

If unsure, ask the player: "Sounds like Face Danger to me — agreed?" beats silently rolling.
