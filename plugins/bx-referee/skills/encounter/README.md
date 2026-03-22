# Encounter

Resolves encounters from first contact through reaction, covering everything before combat starts (if it starts at all).

## Invocation

```
/bx-referee:encounter [monster] [count] [dungeon|wilderness]
```

## What it does

Follows the OSE encounter sequence: rolls monster HP, determines surprise, sets encounter distance, and makes a reaction roll. Based on the reaction result and the player's response, the encounter may resolve through parley, flight/evasion, or escalate to combat. If combat begins, this skill builds a structured handoff block and passes it to the combat skill.
