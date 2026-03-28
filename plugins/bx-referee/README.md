# B/X Referee

<table>
<tr>
<td width="75%">

A solo play tool for Old-School Essentials (OSE). Point it at a B/X adventure module (PDF or Markdown) and it runs the game as referee, reading room keys, rolling encounters, and resolving combat while you control the party. It won't replace a human referee, but if you've got old modules collecting dust and nobody to run them, it's a way to actually play through them.

</td>
<td width="25%" align="center">
<img src="skills/referee/references/ose-compatible-logo.png" alt="Old-School Essentials compatibility logo: 'Designed for use with Old-School Essentials' in red and white text on a black background" width="360">
</td>
</tr>
</table>

## Prerequisites

- [Claude Code](https://code.claude.com/docs) version 1.0.33 or later.
- An OSE or B/X adventure module in PDF or Markdown format. Adventures are available from [Exalted Funeral](https://www.exaltedfuneral.com/collections/old-school-essentials), [DriveThruRPG (OSE)](https://www.drivethrurpg.com/en/publisher/5606/necrotic-gnome/category/32434/old-school-essentials), and [DriveThruRPG (classic B/X)](https://www.drivethrurpg.com/en/publisher/44/wizards-of-the-coast/category/9736/d-d-basic?src=cat9736).

## Install

```console
/plugin install bx-referee@osr-plugins
```

## Skills

| Skill | Invocation | Description |
|---|---|---|
| [Referee](skills/referee/README.md) | `/bx-referee:referee` | Orchestrator that routes to the right skill based on game context |
| [Adventure](skills/adventure/README.md) | `/bx-referee:adventure` | Set up from module files, resume sessions, save state |
| [Character](skills/character/README.md) | `/bx-referee:character` | Interactive character creation and level-up with SRD rules lookup |
| [Exploration](skills/exploration/README.md) | `/bx-referee:exploration` | Dungeon/wilderness turn loop with movement, wandering monsters, searching, doors, traps, spells, encumbrance |
| [Encounter](skills/encounter/README.md) | `/bx-referee:encounter` | Surprise, distance, reaction, flee/evasion, parley, spells |
| [Combat](skills/combat/README.md) | `/bx-referee:combat` | Initiative, attacks, damage, saving throws, morale, spells, death, XP and leveling |

## How it works

The referee is governed by an inviolable [constitution](skills/referee/references/constitution.md) that enforces player agency, information discipline, module fidelity, and neutral adjudication. The player always controls their characters. The referee describes the world and resolves actions, nothing more.

### SRD references

The plugin includes a **pre-cached copy of the [OSE SRD](https://oldschoolessentials.necroticgnome.com/srd/)** (316 pages) as Markdown reference files. A [docs map](skills/referee/references/srd_map.md) system with [monster](skills/referee/references/srd_monsters.md) and [spell](skills/referee/references/srd_spells.md) submaps lets each skill find and read the exact rule it needs without network calls or script execution.

### Adventure flow

1. **Setup.** Point the adventure skill at a module file (PDF or Markdown). It surveys the module, builds a location index, and checks for existing characters or parties before creating new ones.
2. **Scene-setting.** The referee reads the module's introductory material and presents the player-facing background, rumors, and opening situation.
3. **Exploration.** Turn-by-turn dungeon or wilderness loop with wandering monster checks, searching, doors, and traps.
4. **Encounters.** Surprise, distance, reaction rolls, flee/evasion, parley, with handoff to combat when fighting starts.
5. **Combat.** Initiative, attacks, damage, saving throws, morale, spells, and death.
6. **Save/resume.** Session state is persisted to Markdown files and can be resumed later.

### Scope

The plugin covers dungeon and wilderness exploration for the B/X level range (levels 1–14), including combat, encounter resolution, character advancement, encumbrance tracking, and spell casting both in and out of combat. High-level play and domain management (strongholds, followers, mass combat, ship combat) are intentionally out of scope.

### Adventure state

Each adventure lives in `adventures/<name>/` with:

- `PARTY.md`: party roster with current HP, equipment, and XP
- `SESSION.md`: session timeline, exploration log, current situation
- `LOCATIONS.md`: indexed keyed locations from the module (with path to module file)

## Licensing

### Open Game License v1.0a

All rules text and tables in the SRD reference files (`skills/referee/references/srd/`) are Open Game Content used under the [Open Game License v1.0a](../../LICENSE-OGL). The full license text and Section 15 copyright notice chain are in [`LICENSE-OGL`](../../LICENSE-OGL).

### Old-School Essentials third-party license

The use of the Old-School Essentials name and compatibility logo is permitted under the [Old-School Essentials Third-Party License](https://necroticgnome.com/products/old-school-essentials-third-party-license) from Necrotic Gnome.

Old-School Essentials is a trademark of Necrotic Gnome. The trademark and Old-School Essentials logo are used with permission of Necrotic Gnome, under license.

This is not an official Old-School Essentials product published by Necrotic Gnome.

### Project code

All skill prompts (SKILL.md files), Python scripts, and docs map files are original work and are not Open Game Content. See [`LICENSE-OGL`](../../LICENSE-OGL) for the Product Identity designation.
