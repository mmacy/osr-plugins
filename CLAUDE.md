# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

OSR Plugins is a plugin marketplace for AI-powered Old-School Renaissance tabletop RPG tools. It uses the Claude Code plugin system to deliver modular AI skills that act as a tabletop RPG referee.

Currently ships one plugin: **B/X Referee** (`plugins/bx-referee/`), which runs Old-School Essentials sessions from adventure module files.

## Running locally

```bash
claude --plugin-dir ./plugins/bx-referee
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
- When changes are made to a plugin, bump its version in **both** `.claude-plugin/plugin.json` and `.github/plugin/marketplace.json`

### B/X Referee skill graph

Skills are specialized LLM prompts defined in `SKILL.md` files with YAML frontmatter (`name`, `description`, `allowed-tools`). They call each other via the `Skill` tool:

```
referee (orchestrator)
├── adventure (lifecycle: new/continue/save)
│   ├── character (PC creation)
│   └── exploration (dungeon turn loop)
│       └── encounter (surprise, reaction, distance)
│           └── combat (initiative, attacks, morale)
```

- `referee` routes based on game context — it's the entry point
- `encounter` produces a structured handoff block that `combat` consumes
- `exploration` and `adventure` manage persistent state files

### SRD reference system

Pre-cached OSE SRD (316 Markdown files) in `plugins/bx-referee/skills/referee/references/srd/`. Three index maps enable fast lookups without network calls:

- `srd_map.md` — rules lookup index
- `srd_monsters.md` — monster lookup index
- `srd_spells.md` — spell lookup index

### Game directory

Player data is stored in a **game directory** chosen by the user at session start (e.g. `~/osr-games`). Skills must never write game files to the plugin cache directory. The referee skill asks for this path and passes it to all downstream skills. SESSION.md records it so skills can resolve paths without re-asking.

```
<game-root>/
├── adventures/<name>/
│   ├── PARTY.md       — canonical party roster (stats, HP, equipment, XP)
│   ├── SESSION.md     — session timeline, exploration log, current situation
│   └── LOCATIONS.md   — indexed keyed locations with module file paths
└── characters/
    └── <name>-<class>.md
```

The repo's gitignore covers `adventures/` and `characters/` except demo content.

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

- **Product Identity:** SKILL.md prompts, Python scripts, index maps, "B/X Referee" name
- **Open Game Content (OGL v1.0a):** SRD rules text in `references/srd/`

Do not mix original prompt content into SRD files or vice versa.
