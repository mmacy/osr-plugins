# Oracle

Rolls Ironsworn oracle tables (Action, Theme, Pay the Price, Settlement Name, character/place oracles, etc.) and the Ask the Oracle yes/no oracle. A thin wrapper over `iron.py oracle` that surfaces raw results before interpretation.

## Invocation

```
/ironsworn-referee:oracle
```

Routed from `referee` when you ask the oracle a question or request inspiration. The `play` skill also delegates here for Pay the Price.

## What it does

- Yes/No oracle with five odds levels (almost certain / likely / 50-50 / unlikely / small chance).
- Any of the 38 vendored oracle tables: Action+Theme combos, character roles/goals/descriptors, place/region/settlement, names (Ironlander by letter, Elf, Giants, Trolls, Varou), turning points, Pay the Price, and the Endure Harm / Endure Stress fate tables.
- Surfaces the raw dice roll and row text before any narrative interpretation.
- Handles sub-rolls automatically (e.g., Pay the Price 99–00 "roll twice more").
