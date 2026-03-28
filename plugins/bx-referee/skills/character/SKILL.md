---
name: character
description: Guides players through creating Old-School Essentials (OSE) characters step-by-step, including rolling ability scores, choosing classes, buying equipment, and completing character sheets. Use when creating a new OSE character, rolling up a PC, generating a character, or creating an entire party.
allowed-tools: WebFetch Bash AskUserQuestion Read Write Edit Glob
---

# Character creation for Old-School Essentials

Guide players through creating OSE characters using the rules from the web-based system reference document (SRD).

## Core principles

The [referee’s constitution](../referee/references/constitution.md) governs all behavior. Read it before beginning play if it is not already in context. Additionally:

1. **Look up rules from SRD** — read `plugins/bx-referee/skills/referee/references/srd_map.md` to find the right file, then Read it
2. **Roll dice with roll.py** — use `uv run plugins/bx-referee/skills/referee/scripts/roll.py "<expr>"`
3. **Use AskUserQuestion** at each character creation decision point

## The character creation process

### 0. Preparation

- **Read from SRD**: `plugins/bx-referee/skills/referee/references/srd/Creating_a_Character.md`
- Run `roll.py -h` to learn command format

### 0.5. House rules

- **AskUserQuestion** (multiSelect): Present optional house rules the player can enable. They may select any combination (or none for classic OSE defaults):
  - **4d6 drop lowest** - Roll 4d6 and drop the lowest die for ability scores (default: 3d6)
  - **Max HP at level 1** - Take maximum hit die value instead of rolling HP (default: roll hit die)
- Remember the player's selections for use in steps 1 and 7

### 1. Roll ability scores

- Use `4d6Lx6` if the player chose "4d6 drop lowest" in step 0.5, otherwise use `3d6x6`
- Roll with Bash, present results (you may offer reroll per sub-par characters section in Creating_a_Character)
- **Read from SRD**: `plugins/bx-referee/skills/referee/references/srd/Ability_Scores.md` for modifiers
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
- **Arcane spellbook (Magic-User, Elf only):** Per `srd/Spell_Books.md`, arcane casters begin with as many spells in their spellbook as they can memorize (1 at level 1). Read the spell list from `srd/Magic-User_Spells.md` and present the 1st-level spells. **AskUserQuestion**: let the player choose. Record the selected spell(s) on a `SPELLS` line (e.g. `SPELLS: 1st: Sleep`). Read Magic is a common choice — mention it but do not force it.
- **Clerics** have no spells at level 1. Skip this.

### 7. Determine hit points

- If the player chose "Max HP at level 1" in step 0.5, take the maximum value of the class hit die + CON modifier (e.g. Fighter with CON +1 = 8+1 = 9 HP). Skip the roll and the reroll offer.
- Otherwise, roll class hit die with CON modifier (if any)
  - **AskUserQuestion**: If base roll without modifier was 1 or 2, offer reroll per optional low HP roll rule in SRD

### 8. Choose alignment

- **Read from SRD**: `plugins/bx-referee/skills/referee/references/srd/Alignment.md`
- **AskUserQuestion**: Present alignment options

### 9. Note languages

- **Read from SRD**: `plugins/bx-referee/skills/referee/references/srd/Languages.md`
- **AskUserQuestion**: Select bonus languages if INT modifier grants them

### 10. Buy equipment

- Roll starting gold per formula in SRD
- **Read from SRD**: `plugins/bx-referee/skills/referee/references/srd/Weapons_and_Armour.md` and `Adventuring_Gear.md`
- **AskUserQuestion**: Offer standard kit or manual selection options
  - **AskUserQuestion**: If the user chose standard kit, present a class-appropriate kit for approval
  - **AskUserQuestion**: If the user chose manual select, use multiSelect to present separate tabs for weapons, armor, and gear, each with a complete checkbox-based multi-select list of items from the SRD. Each multiSelect item list should include only the item names and their cost in "Item Name (cost)" format - omit descriptions.

### 11. Note armor class

- Calculate from armor + DEX modifier

### 12. Calculate encumbrance

Using the **detailed encumbrance** system from `srd/Time%2C_Weight%2C_Movement.md` (Option 2):

- Sum equipment weight: armour and weapon weights from `srd/Weapons_and_Armour.md`, plus 80 cn for miscellaneous adventuring gear (backpack, rations, rope, spikes, sacks, etc.)
- Add coin weight: 1 cn per coin of any type
- Record total as `ENC [total]/1,600 cn`
- Determine movement rate from the detailed encumbrance table:
  - Up to 400 cn: MV 120'(40')
  - Up to 600 cn: MV 90'(30')
  - Up to 800 cn: MV 60'(20')
  - Up to 1,600 cn: MV 30'(10')
- Format: `ENC [total]/1,600 cn | MV [rate]`

### 13. Note level and XP

- Level 1, XP 0
- Use XP needed for level 2 from class data already extracted in step 2

### 14. Identify character

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
  - ENC [current]/1,600 cn | MV [rate]
  - LANGUAGES: [list]
```

## Level-up procedure

Invoked by `Skill "character" "level-up <adventure-path>"` from the combat skill after XP is awarded. This is not part of character creation.

### 1. Identify eligible PCs

Read the adventure's `PARTY.md`. For each surviving PC, compare their current XP to the next-level threshold (the value after `/` in `XP current/next`). Process each PC whose XP ≥ threshold.

### 2. Enforce one-level-per-session cap

Per `srd/Advancement.md`: a character cannot advance more than one level per session. If the PC's XP would reach the threshold for the level *after* the new one, cap it at 1 XP below that threshold. Update the XP value in PARTY.md accordingly.

### 3. Read class progression data

Read the PC's class SRD page (e.g. `srd/Fighter.md`, `srd/Cleric.md`) to find the new level's row in the Level Progression table. Extract:

- **HD**: new Hit Dice expression
- **THAC0**: new THAC0 value
- **Saving throws**: Death, Wands, Paralysis, Breath, Spells values
- **Spell slots** (if applicable): slots per spell level
- **Thief skills** (if Thief): updated skill percentages from the Thief Skills table
- **Turning table** (if Cleric): note any improved turning results

### 4. Roll new Hit Die

Roll one additional Hit Die of the class type using `roll.py`:

```bash
uv run plugins/bx-referee/skills/referee/scripts/roll.py "1d8"
```

- Add the PC's CON modifier to the roll. Minimum 1 HP gained per die regardless of CON penalty.
- **CON cap**: at level 10+ (when the class table shows a fixed HP bonus like `+2` instead of a die), CON modifiers no longer apply. The HP gain is the fixed amount shown.
- Add the result to the PC's HP max. Set current HP to the new max (level-up restores full HP).
- Report the roll, modifier, and new HP total.

### 5. Update PARTY.md

Use Edit to update the leveled-up PC's stat block:

- **Level**: increment (e.g. `Level 1` → `Level 2`)
- **HP**: new `current/max` (both set to new max)
- **THAC0**: new value from the class table
- **XP**: keep current total, update the next-level threshold to match the new next level
- **SAVES**: new saving throw values
- **Spell slots** (Cleric, Magic-User, Elf): add a `SPELLS` line if gaining first slots, or update existing counts. Format: `SPELLS: 1st:[n] 2nd:[n] ...`
  - **Arcane casters (Magic-User, Elf):** Per `srd/Spell_Books.md`, when a caster gains access to a new spell level, they may add new spells to their spellbook via mentoring. Read the appropriate spell list from `srd/Magic-User_Spells.md` and **AskUserQuestion** to let the player choose which spell(s) to add. Update the `SPELLS` line with the new selections.
  - **Clerics:** Clerics pray for spells daily from the full Cleric spell list — no spellbook. When they first gain slots (level 2), or gain access to a new spell level, **AskUserQuestion** to let the player choose which spells to prepare. Update the `SPELLS` line.
- **Thief skills** (Thief only): update or add a `THIEF SKILLS` line with new percentages

### 6. Announce

Report to the player: "[Name] has reached level [N]!" followed by a brief summary of what changed (new HP, improved saves, new spell slots, etc.).

## After completion

- **AskUserQuestion**: Save character? If an adventure is active (check conversation context for adventure path), append the character block to that adventure's `PARTY.md`. Otherwise, write to `<game-root>/characters/[name]-[class].md`. The game root is passed as an argument (e.g. `Skill "character" "/Users/player/osr-games"`). If not available from arguments or conversation context, **AskUserQuestion** for the game directory.
- When appending to PARTY.md, use `HP [value]/[value]` format (current/max) and add a blank line before the new character block.

Example character block:

```
- BLARG | Fighter | Level 1 | Neutral | He/Him
  - STR 14 (+1) | INT 10 | WIS 11 | DEX 14 (+1) | CON 15 (+1) | CHA 11
  - AC 1 [18] | HP 7/7 | THAC0 19 [0] | XP 0/2,000 (+5%)
  - SAVES: Death 12 | Wands 13 | Paralysis 14 | Breath 15 | Spells 16
  - EQUIPMENT: Plate mail, shield, sword (1d8), dagger (1d4), torches x12, tinder box, backpack
  - MONEY: 10 gp, 2 sp
  - ENC 670/1,600 cn | MV 90'(30')
  - LANGUAGES: Common (broken), Neutral
```
