# Referee

Orchestrator skill that routes to the right Ironsworn skill based on game state. The main entry point for the plugin.

## Invocation

```
/ironsworn-referee:referee
```

## What it does

- Asks the player for the game directory and what they want to do (new campaign, continue, create character only).
- Routes to `world`, `character`, `play`, `oracle`, or `session` as appropriate.
- Hosts shared resources: the `iron.py` CLI, the vendored Datasworn YAML data, the constitution, and the move disambiguation guide.
