# OSR Game Client

OSR Game Client is a native Copilot CLI webview for playing Old-School Essentials adventures with the `bx-referee` plugin. It keeps the table state, party roster, locations, dice, SRD lookup, and referee chat in one desktop window while the agent runs the game.

![OSR Game Client showing the session dashboard and referee chat](assets/screenshot.png)

## What it does

- Opens a desktop client with `/osr-game-client`.
- Connects to a game directory containing `adventures/` and `characters/`.
- Lists existing adventures and can hand off new adventure setup to `bx-referee`.
- Shows the current session state: location, turn/hour, light, current situation, and party HP.
- Provides tabs for combat, dice rolling, keyed locations, session notes/logs, and OSE SRD lookup.
- Mirrors the referee conversation in a chat panel, including live thinking/tool status when verbose mode is enabled.

## Requirements

- Copilot CLI with extension support.
- The `bx-referee` plugin from this repository.
- `uv` on `PATH` for the `bx-referee` dice roller script.
- A game directory where adventure state can be saved, for example `~/osr-games`.

## Run from this repository

Build the React client once before launching from a fresh checkout:

```bash
cd .github/extensions/osr-game-client/content
npm install
npm run build
```

Start Copilot CLI from the repository root so it can load the project extension, then run:

```text
/osr-game-client
```

On first launch, the setup checklist asks for:

1. **Game directory**: the root that contains `adventures/` and `characters/`.
2. **bx-referee plugin location**: the plugin folder containing `skills/referee/scripts/roll.py` and SRD references. Auto-detection handles the common local checkout and installed-plugin paths.

## Game files

The client reads and writes player-facing state in the selected game directory:

```text
<game-root>/
├── adventures/<name>/
│   ├── PARTY.md
│   ├── SESSION.md
│   ├── LOCATIONS.md
│   └── .osr-game-client/
└── characters/
```

The `.osr-game-client/` sidecar stores client-only state such as combat tracker data, chat transcript, visited location marks, and notes. It does not replace the canonical `PARTY.md`, `SESSION.md`, or `LOCATIONS.md` files managed by the `bx-referee` skills.
