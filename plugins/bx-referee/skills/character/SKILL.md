---
name: character
description: Guides players through creating Old-School Essentials (OSE) characters step-by-step, including rolling ability scores, choosing classes, buying equipment, and completing character sheets. Use when creating a new OSE character, rolling up a PC, generating a character, or creating an entire party.
allowed-tools: WebFetch, Bash, AskUserQuestion, Read, Write, Edit, Glob
---

# Character creation for Old-School Essentials

Guide players through creating OSE characters using the rules from the web-based system reference document (SRD).

## Core principles

The [referee’s constitution](../referee/references/constitution.md) governs all behavior. Additionally:

1. **Look up rules from SRD** — read `plugins/bx-referee/skills/referee/references/srd_map.md` to find the right file, then Read it
2. **Roll dice with roll.py** — use `uv run plugins/bx-referee/skills/referee/roll.py "<expr>"`
3. **Use AskUserQuestion** at each character creation decision point

## The character creation process

### 0. Preparation

- **Read from SRD**: `plugins/bx-referee/skills/referee/references/srd/ Creating_a_Character.md`
- Run `roll.py -h` to learn command format

### 0.5. House rules

- **AskUserQuestion** (multiSelect): Present optional house rules the player can enable. They may select any combination (or none for classic OSE defaults):
  - **4d6 drop lowest** - Roll 4d6 and drop the lowest die for ability scores (default: 3d6)
  - **Max HP at level 1** - Take maximum hit die value instead of rolling HP (default: roll hit die)
- Remember the player's selections for use in steps 1 and 7

### 1. Roll ability scores

- Use `4d6Lx6` if the player chose "4d6 drop lowest" in step 0.5, otherwise use `3d6x6`
- Roll with Bash, present results (you may offer reroll per sub-par characters section in Creating_a_Character)
- **Read from SRD**: `plugins/bx-referee/skills/referee/references/srd/ Ability_Scores.md` for modifiers
- **AskUserQuestion**: Offer reroll per optional rules in SRD

### 2. Choose class

- **Read from SRD**: class pages (e.g. `plugins/bx-referee/skills/referee/references/srd/Fighter.md`, `Thief.md`, `Magic-User.md`, etc.)
- **AskUserQuestion**: Present every viable class per the rolled ability scores and very brief descriptions from the SRD

### 3. Adjust ability scores (optional)

- **AskUserQuestion**: Offer to adjust scores per adjustment option in the SRD

### 4. Note ability score modifiers

- Calculate and display the ability modifiers using data in your context

### 5. Note attack values

- Use THAC0 from class data already extracted in step 2

### 6. Note saving throws and class abilities

- Use saving throws, special abilities, and restrictions from class data already extracted in step 2

### 7. Determine hit points

- If the player chose "Max HP at level 1" in step 0.5, take the maximum value of the class hit die + CON modifier (e.g. Fighter with CON +1 = 8+1 = 9 HP). Skip the roll and the reroll offer.
- Otherwise, roll class hit die with CON modifier (if any)
  - **AskUserQuestion**: If base roll without modifier was 1 or 2, offer reroll per optional low HP roll rule in SRD

### 8. Choose alignment

- **Read from SRD**: `plugins/bx-referee/skills/referee/references/srd/ Alignment.md`
- **AskUserQuestion**: Present alignment options

### 9. Note languages

- **Read from SRD**: `plugins/bx-referee/skills/referee/references/srd/ Languages.md`
- **AskUserQuestion**: Select bonus languages if INT modifier grants them

### 10. Buy equipment

- Roll starting gold per formula in SRD
- **Read from SRD**: `plugins/bx-referee/skills/referee/references/srd/ Weapons_and_Armour.md` and `Adventuring_Gear.md`
- **AskUserQuestion**: Offer standard kit or manual selection options
  - **AskUserQuestion**: If the user chose standard kit, present a class-appropriate kit for approval
  - **AskUserQuestion**: If the user chose manual select, use multiSelect to present separate tabs for weapons, armor, and gear, each with a complete checkbox-based multi-select list of items from the SRD. Each multiSelect item list should include only the item names and their cost in "Item Name (cost)" format - omit descriptions.

### 11. Note armor class

- Calculate from armor + DEX modifier

### 12. Note level and XP

- Level 1, XP 0
- Use XP needed for level 2 from class data already extracted in step 2

### 13. Identify character

- **AskUserQuestion**: Character name
- **AskUserQuestion**: Pronouns

## Character sheet format

Present completed character concisely. Add sections like THIEF SKILLS, CLERIC TURNING, or SPELLS only as needed - remember that **tokens are expensive**!

```
- NAME | Class | Level [n] | Alignment | Pronouns
  - STR [score] ([mod]) | INT [score] ([mod]) | WIS [score] ([mod]) | DEX [score] ([mod]) | CON [score] ([mod]) | CHA [score] ([mod])
  - AC [value] | HP [value] | THAC0 [value] | XP 0/[next level] ([bonus %])
  - SAVES: Death [value] | Wands [value] | Paralysis [value] | Breath [value] | Spells [value]
  - SPECIAL ABILITIES: [list]
  - EQUIPMENT: [list]
  - MONEY: [coin type] [n], ...
  - LANGUAGES: [list]
```

## After completion

- **AskUserQuestion**: Save character? If an adventure is active (check conversation context for adventure path), append the character block to that adventure's `PARTY.md`. Otherwise, write to `characters/[name]-[class].md`.
- When appending to PARTY.md, use `HP [value]/[value]` format (current/max) and add a blank line before the new character block.

Example character block:

```
- BLARG | Fighter | Level 1 | Neutral | He/Him
  - STR 14 (+1) | INT 10 | WIS 11 | DEX 14 (+1) | CON 15 (+1) | CHA 11
  - AC 1 [18] | HP 7/7 | THAC0 19 [0] | XP 0/2,000 (+5%)
  - SAVES: Death 12 | Wands 13 | Paralysis 14 | Breath 15 | Spells 16
  - EQUIPMENT: Plate mail, shield, sword (1d8), dagger (1d4), torches x12, tinder box, backpack
  - MONEY: 10 gp, 2 sp
  - LANGUAGES: Common (broken), Neutral
```
