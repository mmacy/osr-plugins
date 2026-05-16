# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

OSR Plugins is a plugin marketplace for AI-powered Old-School Renaissance tabletop RPG tools. It uses the Claude Code plugin system to deliver modular AI skills that act as a tabletop RPG referee.

Ships two plugins:

- **B/X Referee** (`plugins/bx-referee/`) — runs Old-School Essentials sessions from adventure module files.
- **Ironsworn Referee** (`plugins/ironsworn-referee/`) — runs solo Ironsworn sessions with a deterministic Python CLI for all mechanics and an LLM co-author for fiction. No prepared module needed.

## Running locally

```bash
claude --plugin-dir ./plugins/bx-referee
# or
claude --plugin-dir ./plugins/ironsworn-referee
```

## Running Python utilities

Scripts use PEP 735 inline metadata for dependencies. Run with `uv run`:

```bash
uv run plugins/bx-referee/skills/referee/scripts/roll.py "3d6x6"
```

No `pyproject.toml` exists — these are standalone scripts, not a Python package.

## Architecture

### Plugin system

- `.github/plugin/marketplace.json` — central registry listing all plugins with versions and source paths
- `.claude-plugin/marketplace.json` — symlink to the above (plugin discovery entrypoint)
- Each plugin has a `.claude-plugin/plugin.json` with metadata and a `skills/` directory
- When changes are made to a plugin, bump its version in `.github/plugin/marketplace.json` only. Do **not** set the version in `.claude-plugin/plugin.json` — for relative-path plugins, the marketplace entry is the version authority. Setting it in both causes update detection to fail.

### Skill graphs

Skills are specialized LLM prompts defined in `SKILL.md` files with YAML frontmatter (`name`, `description`, `allowed-tools`). They call each other via the `Skill` tool.

**B/X Referee** (hidden-module referee model):

```
referee (orchestrator)
├── adventure (lifecycle: new/continue/save)
│   ├── character (PC creation)
│   └── exploration (dungeon turn loop)
│       └── encounter (surprise, reaction, distance)
│           └── combat (initiative, attacks, morale)
```

- `encounter` produces a structured handoff block that `combat` consumes.
- `exploration` and `adventure` manage persistent state files.

**Ironsworn Referee** (co-author + deterministic-CLI model):

```
referee (orchestrator)
├── world      (Your Truths setup)
├── character  (PC creation: stats, assets, vow, bonds)
├── play       (main loop; owns combat AND journey lifecycle)
├── oracle     (table + yes/no oracle rolls)
└── session    (save/resume + roll-log audit trail)
```

- Mechanics are deterministic via `iron.py` — the agent never invents rolls.
- The `play` skill owns the lifecycles of journeys and fights (no separate combat/journey skills).
- Vendored Datasworn YAML at `plugins/ironsworn-referee/skills/referee/references/datasworn/` (pinned to `v0.1.0-prerelease`, mixed CC BY 4.0 / CC BY-NC-SA 4.0).

### SRD reference systems

**B/X Referee** has a pre-cached OSE SRD (316 Markdown files) in `plugins/bx-referee/skills/referee/references/srd/` with three index maps (`srd_map.md`, `srd_monsters.md`, `srd_spells.md`) for fast lookups.

**Ironsworn Referee** has vendored Datasworn YAML at `plugins/ironsworn-referee/skills/referee/references/datasworn/` consumed via the `iron.py` CLI (no static index maps — `iron list <type>` enumerates at runtime).

### Game directory

Player data is stored in a **game directory** chosen by the user at session start (e.g. `~/osr-games`). Skills must never write game files to the plugin cache directory. Each referee skill asks for this path and passes it to all downstream skills. SESSION.md records it so skills can resolve paths without re-asking.

```
<game-root>/
├── adventures/<name>/                  (B/X Referee)
│   ├── PARTY.md
│   ├── SESSION.md
│   └── LOCATIONS.md
├── characters/<name>-<class>.md        (B/X Referee)
└── campaigns/<name>/                   (Ironsworn Referee)
    ├── CHARACTER.md
    ├── VOWS.md
    ├── BONDS.md
    ├── TRUTHS.md
    ├── JOURNEYS.md  (created when needed)
    ├── FIGHTS.md    (created when needed)
    ├── SESSION.md
    └── JOURNAL.md   (optional)
```

The repo's gitignore covers `adventures/`, `characters/`, and `campaigns/` except demo content.

## Skill authoring conventions

All plugins must conform to the [Agent Skills specification](https://agentskills.io/specification.md). Key requirements:

- Each skill is a directory containing a `SKILL.md` with YAML frontmatter + Markdown body
- **`name`** (required): 1-64 chars, lowercase alphanumeric and hyphens only, must match the parent directory name
- **`description`** (required): 1-1024 chars, describes what the skill does and when to use it
- **`allowed-tools`** (optional, experimental): space-delimited list of pre-approved tools
- Optional spec fields not yet used here: `license`, `compatibility`, `metadata`
- Optional directories: `scripts/`, `references/`, `assets/`
- Keep `SKILL.md` under 500 lines; move detailed reference material to separate files (progressive disclosure)
- Validate with `skills-ref validate ./my-skill`

Each skill's README.md documents its purpose and usage for end users; the SKILL.md is the actual prompt.

## Licensing boundaries

**B/X Referee:**

- **Product Identity:** SKILL.md prompts, Python scripts, index maps, "B/X Referee" name
- **Open Game Content (OGL v1.0a):** SRD rules text in `plugins/bx-referee/skills/referee/references/srd/`

Do not mix original prompt content into SRD files or vice versa.

**Ironsworn Referee:**

- **Vendored Ironsworn content:** Datasworn YAML in `plugins/ironsworn-referee/skills/referee/references/datasworn/` — mixed CC BY 4.0 and CC BY-NC-SA 4.0 per the `LICENSE.md` in that directory. Distributed overall as CC BY-NC-SA 4.0 (most restrictive constraint applies).
- **Project code:** SKILL.md prompts, `iron.py`, constitution, disambiguation guide. Distributed under CC BY-NC-SA 4.0 for compatibility with the vendored content.

Do not edit the vendored Datasworn YAML — to update, re-vendor from upstream (see `plugins/ironsworn-referee/skills/referee/references/datasworn/LICENSE.md` for the re-vendor procedure).
