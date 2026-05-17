---
name: world
description: >-
  Sets up the campaign's Ironlands: walks the player through "Your Truths" choices
  (Iron, Religion, Legacies, Magic, etc.) and records the chosen region. Writes
  TRUTHS.md. Use once at the start of a new campaign, before character finalization
  or the first scene.
allowed-tools: Bash AskUserQuestion Read Write Edit Glob Skill
---

# World setup — Your Truths

You guide the player through Ironsworn's "Your Truths" worldbuilding (rulebook ch. 4, p. 122–129) and write `TRUTHS.md`.

## Core principles

The [referee's constitution](../referee/references/constitution.md) governs all behavior. Read it before play if not in context.

- The player picks each truth; you present the options and explain implications.
- For each truth, the player may **pick** one of the three options OR **roll 1d100** for a random selection OR **invent** their own custom truth.
- The truth's `quest_starter` text is for inspiration — surface it but don't force the player to take that quest.

## Game directory

Passed in as the last argument. Write to `<game-root>/campaigns/<campaign-name>/TRUTHS.md`.

## CLI helpers

- List truth categories: `uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py list truths`
- Show options for one category: `uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py truths <id>`
- Roll for a category: `uv run plugins/ironsworn-referee/skills/referee/scripts/iron.py truths <id> --roll <1-100>`

## Workflow

### Step 1: List truths

Run `iron list truths`. The classic ruleset has these categories (rulebook order):

1. The Old World (p. 123)
2. Iron (p. 124)
3. Legacies (p. 124)
4. Communities (p. 125)
5. Leaders (p. 125)
6. Defense (p. 126)
7. Mysticism (p. 127)
8. Religion (p. 127)
9. Firstborn (p. 128)
10. Beasts (p. 128)
11. Horrors (p. 129)

### Step 2: Walk through each

For each category in order:

1. Read the category options: `iron truths <id>`.
2. Present the three options to the player **briefly** — name and a one-line summary of each option's tone. Do not dump the full description text unprompted.
3. **AskUserQuestion**: "Which truth fits your Ironlands? You can pick, roll for a random one, or describe your own."
4. If the player asks for details on an option, read out the full description from the CLI output. If they want to hear the `quest_starter` for inspiration, surface that too.
5. If they roll: `iron truths <id> --roll <n>` (or roll 1d100 via any method) and use the `chosen` result.
6. If they invent: write their custom truth.

Don't badger the player to explain their choice — record it and move on.

### Step 3: Region

After all 11 truths, **AskUserQuestion**: which region of the Ironlands is the character based in? The atlas covers:

- Barrier Islands
- Ragged Coast
- Deep Wilds
- Flooded Lands
- Havens
- Hinterlands
- Tempest Hills
- Veiled Mountains
- Shattered Wastes

(See rulebook p. 112–121. The `atlas.yaml` reference is available at `references/datasworn/atlas.yaml` if the player wants details.)

### Step 4: Write TRUTHS.md

```markdown
# Your Truths

## Region

<Region name>

## Truths

### The Old World

<Chosen option description, or custom truth>

### Iron

<...>

### Legacies

<...>

### Communities

<...>

### Leaders

<...>

### Defense

<...>

### Mysticism

<...>

### Religion

<...>

### Firstborn

<...>

### Beasts

<...>

### Horrors

<...>
```

After writing, hand control back to `referee`.
