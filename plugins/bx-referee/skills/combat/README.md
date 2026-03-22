# Combat

Resolves combat round by round using OSE rules.

## Invocation

```
/bx-referee:combat [monster] [count] [environment] [distance]
```

## What it does

Runs the full combat sequence: group initiative, action declaration, movement, ranged attacks, melee attacks, spell resolution, monster actions, morale checks, and ongoing effects. Accepts a structured handoff block from the encounter skill or sets up combat manually.

Tracks HP for both sides, handles saving throws, spell durations, and special monster abilities. Updates `PARTY.md` with HP changes, expended resources, XP, and casualties after combat ends.
