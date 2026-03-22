# Adventure

Manages the adventure lifecycle: setting up new adventures from module files, building parties, resuming sessions, and saving state.

## Invocation

```
/bx-referee:adventure [new|continue|save]
```

## What it does

- **New.** Reads a module file (PDF or Markdown), surveys keyed locations, builds `LOCATIONS.md`, assembles a party (from existing characters or by creating new ones), and sets the opening scene.
- **Continue.** Loads saved session state, recaps where the party left off, and hands off to exploration.
- **Save.** Persists current HP, XP, equipment, and session progress to `PARTY.md` and `SESSION.md`.
