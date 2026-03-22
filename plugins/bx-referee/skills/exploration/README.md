# Exploration

Runs the dungeon exploration turn loop, where each turn represents 10 minutes of in-game time.

## Invocation

Called automatically by the adventure skill when play begins or resumes. Not typically invoked directly.

## What it does

Manages the turn-by-turn exploration cycle: wandering monster checks, reading keyed locations from the module file, describing rooms, resolving searches and door checks, and tracking light sources, rations, and rest. When monsters are encountered (wandering or room-based), hands off to the encounter skill and picks up the updated party state afterward.
