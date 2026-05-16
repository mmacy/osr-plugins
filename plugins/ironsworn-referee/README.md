# Ironsworn Referee

A solo and co-op play tool for [Ironsworn](https://ironswornrpg.com) by Shawn Tomkin. The agent acts as your co-author — it identifies which move your action triggers, calls a deterministic CLI for every dice roll, and narrates outcomes from the move's own text. It is not a hidden-information referee — Ironsworn has no module to hide. It is a rules engine and a fiction collaborator.

## Prerequisites

- [Claude Code](https://code.claude.com/docs) (or any Claude harness supporting [agent skills](https://agentskills.io/home)).
- [`uv`](https://docs.astral.sh/uv/) on PATH (used to run the deterministic CLI).

No copy of the Ironsworn rulebook is required to play, but you may want one for reference. The free PDF is available at [ironswornrpg.com](https://ironswornrpg.com).

## Install

```console
/plugin install ironsworn-referee@osr-plugins
```

## Skills

| Skill | Invocation | Description |
|---|---|---|
| [Referee](skills/referee/README.md) | `/ironsworn-referee:referee` | Orchestrator — routes to the right skill based on game state |
| [Character](skills/character/README.md) | `/ironsworn-referee:character` | Creates a PC: stats, three assets, background vow, bonds |
| [World](skills/world/README.md) | `/ironsworn-referee:world` | Walks the player through "Your Truths" worldbuilding |
| [Play](skills/play/README.md) | `/ironsworn-referee:play` | The main loop — identify move, call CLI, narrate, owns journey + fight lifecycles |
| [Oracle](skills/oracle/README.md) | `/ironsworn-referee:oracle` | Roll any oracle table or yes/no oracle; show raw results |
| [Session](skills/session/README.md) | `/ironsworn-referee:session` | Save and resume campaigns; log every roll to SESSION.md |

## How it works

### Deterministic mechanics, agent narration

Every dice roll, oracle lookup, and rules-derived value comes from `iron.py` — a stateless Python CLI that produces structured JSON. The agent identifies which move triggers from your fiction, calls the CLI for the math, and narrates the outcome from the move's authoritative text. The agent cannot fudge a roll; the CLI cannot invent fiction. The split is deliberate.

This sidesteps the "LLM rolls its own dice" failure mode that plagues PbtA-on-LLM attempts, and produces a verifiable game history in `SESSION.md`.

### Constitution

The agent is governed by an inviolable [constitution](skills/referee/references/constitution.md) covering player agency, transparency about mechanics, move-outcome authority, deterministic roll integrity, oracle interpretation discipline, and player ownership of mechanical choices (burning momentum, picking stats, choosing hit options).

### Vendored Datasworn data

The plugin includes the Ironsworn classic ruleset as structured YAML, vendored from the [Datasworn](https://github.com/rsek/datasworn) project at tag `v0.1.0-prerelease`. Covers all 35 moves, 38 oracle tables (including the embedded Pay the Price, Endure Harm, and Endure Stress fate tables), 78 asset cards, NPCs, Your Truths tables, and the Ironlands atlas.

See `skills/referee/references/datasworn/LICENSE.md` for per-file licensing.

### Campaign state

Each campaign lives in `<game-dir>/campaigns/<name>/` with:

- `CHARACTER.md` — stats, meters, debilities, assets, experience
- `VOWS.md` — active and completed vows + progress ticks
- `BONDS.md` — bond entries + shared bonds progress track
- `TRUTHS.md` — Your Truths choices for the world
- `JOURNEYS.md` — active journey tracks (created when needed)
- `FIGHTS.md` — active fight tracks + initiative state (created when needed)
- `SESSION.md` — timeline + roll log (audit trail)
- `JOURNAL.md` — optional long-form narrative

## Scope

The plugin covers solo Ironsworn play end-to-end: character creation, world setup, the moves loop (adventure / relationship / combat / suffer / quest / fate), journey and fight lifecycles, oracle consultation, and save/resume. Multi-PC co-op play is not supported in v0.1; planned for v0.2.

Out of scope: Ironsworn: Delve and Ironsworn: Starforged. Those have separate Datasworn rulesets and would be separate plugins.

## Licensing

### Ironsworn rules content

The vendored rules data in `skills/referee/references/datasworn/` is content authored by Shawn Tomkin (Ironsworn © 2018), distributed via the [Datasworn](https://github.com/rsek/datasworn) project. Individual YAML files are licensed under CC BY 4.0 or CC BY-NC-SA 4.0 — see [LICENSE.md](skills/referee/references/datasworn/LICENSE.md) for the per-file inventory. Because the set as a whole includes CC BY-NC-SA 4.0 material, the **vendored directory is distributed under CC BY-NC-SA 4.0**.

### Project code

All skill prompts (SKILL.md), the constitution, the disambiguation guide, the Python CLI (`iron.py`), and tests are original work by Marsh Macy, distributed under the same license as the vendored content (CC BY-NC-SA 4.0) for compatibility.

Ironsworn is a trademark of Shawn Tomkin. This is not an official Ironsworn product.
