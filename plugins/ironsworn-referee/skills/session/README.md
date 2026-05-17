# Session

Saves and resumes Ironsworn campaigns. Maintains `SESSION.md` — the canonical session state and roll log — and is the entry point for resuming an existing campaign.

## Invocation

```
/ironsworn-referee:session
```

Routed from `referee` at session start, when you say "save", or when you say "resume". The roll log is updated continuously during play; the session marker (Start / Save / End) is updated by this skill.

## What it does

- New session: initializes `SESSION.md` with the game directory, campaign name, character, and starting timestamp.
- Resume: reads `SESSION.md`, `CHARACTER.md`, `VOWS.md`, `BONDS.md`, `TRUTHS.md`, and any `JOURNEYS.md` / `FIGHTS.md`. Presents a 3–5 sentence recap of where you left off.
- Save: appends a save marker with a one-line situation summary.
- End session: appends a close marker and offers a "where we left off" note for next time.
- Maintains the roll log: every `iron.py` invocation's inputs and outputs are recorded as one-line deltas (the audit trail).
