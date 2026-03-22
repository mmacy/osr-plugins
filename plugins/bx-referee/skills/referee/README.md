# Referee

Orchestrator skill that routes to specialized skills based on game context. This is the main entry point for the plugin.

## Invocation

```
/bx-referee:referee
```

## What it does

- Asks the player what they want to do (new adventure, continue, create characters)
- Routes to the appropriate skill during play (exploration, encounter, combat, save)
- Hosts shared resources used by all other skills: the dice roller, SRD reference files, and the referee's constitution
