# Play

The main Ironsworn play loop. Identifies which move triggers from the player's described action, calls `iron.py` for mechanics, narrates outcomes, and owns the lifecycles of journeys and fights.

## Invocation

```
/ironsworn-referee:play
```

Routed from `referee` whenever the player describes a character action. You generally don't invoke this directly — describe what your character does and the referee will route here.

## What it does

- Identifies the triggered move from your fiction (Face Danger, Strike, Compel, etc.) using a heuristic disambiguation guide. Asks if uncertain.
- Asks you which stat to roll when the move offers a choice.
- Calls the CLI for the action roll (or progress roll, or suffer helper), surfaces the raw dice, narrates outcomes from the move's authoritative text.
- Tracks active journeys (waypoint progress, Reach Your Destination) in `JOURNEYS.md`.
- Tracks active fights (foe rank, initiative state, progress, Turn the Tide consumed) in `FIGHTS.md`.
- Updates `CHARACTER.md` meters, debilities, and asset marks; updates `VOWS.md` and `BONDS.md` progress.
- Surfaces player-choice moments (burn momentum, choose-one hit options, suffer-at-zero) and waits for your decision.
