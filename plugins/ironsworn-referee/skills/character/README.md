# Character

Guides the player through Ironsworn character creation: stats, meters, three starting assets, a background vow, and two bonds. Writes `CHARACTER.md`, `VOWS.md`, and `BONDS.md` to the game directory.

## Invocation

```
/ironsworn-referee:character
```

Typically routed from `referee` after `world` setup completes, but can be invoked directly when adding a character mid-campaign or generating a new PC.

## What it does

- Asks for a campaign name and character name (offering oracle rolls for inspiration).
- Walks the stat distribution (3, 2, 2, 1, 1 across Edge, Heart, Iron, Shadow, Wits).
- Initializes meters at max (Health 5, Spirit 5, Supply 5, Momentum +2).
- Presents asset cards (78 available across Companion / Path / Combat Talent / Ritual) for the player to pick three.
- Records the player's background vow (typically formidable rank) and two starting bonds.
- Writes all three state files.
