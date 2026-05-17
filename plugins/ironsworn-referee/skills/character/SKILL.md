---
name: character
description: >-
  Creates an Ironsworn player character: name, five stats (Edge/Heart/Iron/Shadow/Wits),
  three assets, a background vow, and two bonds. Writes CHARACTER.md, VOWS.md, and
  BONDS.md to the game directory. Use when starting a new campaign or creating a new
  character.
allowed-tools: Bash AskUserQuestion Read Write Edit Glob Skill
---

# Character creation

You guide the player through Ironsworn character creation (rulebook ch. 2, p. 31–47).

## Core principles

The [referee's constitution](../referee/references/constitution.md) governs all behavior. Read it before play if not in context.

- The player decides every creative element. You ask, they choose.
- All mechanics go through `iron.py`.
- All state is written to files in the game directory under `campaigns/<campaign-name>/`.

## Game directory

Passed in as the last argument. If absent, **AskUserQuestion** for the game directory (suggest `~/osr-games` as a default). All files this skill creates go under `<game-root>/campaigns/<campaign-name>/`.

## CLI helpers

- Assets: `uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py asset <id>`
- List all assets: `uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py list assets`

## Workflow

### Step 1: Campaign name

**AskUserQuestion**: campaign name (used as the directory slug, e.g. `vow-of-the-iron-pillar`).

```bash
mkdir -p <game-root>/campaigns/<name>
```

### Step 2: Character name

**AskUserQuestion**: character name. If uncertain, the player can roll on a name oracle — Ironlander names are split by starting letter (`classic/name/ironlander/a` through `…/z`), or use `classic/name/elf` / `classic/name/other/giants` / `…/varou` / `…/trolls` per lineage.

### Step 3: Stats (rulebook p. 33)

Distribute these five values across Edge, Heart, Iron, Shadow, Wits — in any order: **3, 2, 2, 1, 1**.

**AskUserQuestion** with a free-text prompt: "Assign 3, 2, 2, 1, 1 to Edge / Heart / Iron / Shadow / Wits. Briefly describe your character's strengths so we can pick a fit, or just give the numbers directly."

### Step 4: Meters (rulebook p. 33–35)

All start at maximum:

- **Health**: +5
- **Spirit**: +5
- **Supply**: +5
- **Momentum**: +2

Max momentum is +10, momentum reset is +2 (debilities reduce both — see `iron momentum bounds`).

### Step 5: Three starting assets (rulebook p. 39–44)

Players pick **three assets** at character creation, one from each type if possible (Companion, Path, Combat Talent, Ritual — pick any three across these). Show the asset list:

```bash
uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py list assets
```

For each candidate the player wants to inspect, run `iron asset <id>` and read the player the name, category, and the first ability's text. Don't overwhelm — show three or four at a time.

Each asset has three abilities; **the first ability is marked at creation**. Track which abilities are marked in CHARACTER.md.

### Step 6: Background vow (rulebook p. 35–36, p. 195)

**AskUserQuestion**: what does the character care about enough to swear an iron vow at game start? Background vows are typically **formidable** rank.

Write the vow to VOWS.md. It starts with 0 ticks of progress.

### Step 7: Bonds (rulebook p. 24, p. 195)

The character starts with **two bonds** — people, communities, or places they are connected to. Either invent them from the player's character concept, or roll on the place/character oracles for inspiration.

The two starting bonds mark the bonds progress track at character creation: **2 ticks**.

### Step 8: Write the files

Use Write to create:

- `<game-root>/campaigns/<name>/CHARACTER.md`
- `<game-root>/campaigns/<name>/VOWS.md`
- `<game-root>/campaigns/<name>/BONDS.md`

## CHARACTER.md template

```markdown
# <Character name>

## Stats

- Edge: <n>
- Heart: <n>
- Iron: <n>
- Shadow: <n>
- Wits: <n>

## Meters

- Health: 5 / 5
- Spirit: 5 / 5
- Supply: 5 / 5
- Momentum: +2 (max +10, reset +2)

## Debilities

- Conditions: (none)
- Banes: (none)
- Burdens: (none)

## Assets

### <Asset name> (<category>)

- [x] <First ability text — marked at creation>
- [ ] <Second ability>
- [ ] <Third ability>

### <Asset name> (<category>)
...

## Experience

- Earned: 0
- Spent: 0
- Available: 0
```

## VOWS.md template

```markdown
# Vows

## Active

### Background vow — <name> (formidable, 0/12 ticks)

<Vow text — what the character swore, why, and to whom.>

## Completed

(none)

## Forsaken

(none)
```

## BONDS.md template

```markdown
# Bonds

## Bonds progress track

- 2 / 40 ticks

## Connections

- <Bond 1 description — person, community, or place>
- <Bond 2 description>
```

After writing all three files, hand control back to `referee` so play can begin.
