import type { AdventureSummary } from "../types";

interface Props {
    gameRoot: string | null;
    adventures: AdventureSummary[];
    adventureName: string | null;
    onChangeAdventure: (name: string) => void;
    onChangeGameRoot: () => void;
    onNewAdventure: () => void;
    onPlay: () => void;
    isContinue: boolean;
    playBusy: boolean;
    connected: boolean;
}

export function Topbar({
    gameRoot,
    adventures,
    adventureName,
    onChangeAdventure,
    onChangeGameRoot,
    onNewAdventure,
    onPlay,
    isContinue,
    playBusy,
    connected,
}: Props) {
    const noAdventures = adventures.length === 0;
    const noSelection = !adventureName;
    const playDisabled = !gameRoot || noSelection || playBusy;
    const playTitle = !gameRoot
        ? "Set a game directory first."
        : noAdventures
            ? "Click + New to create your first adventure."
            : noSelection
                ? "Select an adventure from the dropdown to play."
                : isContinue
                    ? "Resume this adventure: the referee will recap and pick up where you left off."
                    : "Begin this adventure: the referee will set the scene and start play.";
    const playLabel = playBusy ? "Sending…" : (isContinue ? "▶ Resume" : "▶ Play");

    return (
        <div className="topbar">
            <div className="brand">⚔ OSR Game Client</div>
            <div className="field">
                <span>Game root:</span>
                <code style={{ fontSize: "0.8rem", color: "var(--text)" }}>
                    {gameRoot ? truncatePath(gameRoot, 40) : "—"}
                </code>
                <button className="ghost" onClick={onChangeGameRoot}>Change…</button>
            </div>
            <div className="field">
                <span>Adventure:</span>
                <select
                    value={adventureName ?? ""}
                    onChange={(e) => onChangeAdventure(e.target.value)}
                    disabled={!gameRoot || noAdventures}
                >
                    <option value="">{noAdventures ? "(none found)" : "Select…"}</option>
                    {adventures.map((a) => (
                        <option key={a.name} value={a.name}>
                            {a.name}
                        </option>
                    ))}
                </select>
                <button
                    className="primary"
                    onClick={onPlay}
                    disabled={playDisabled}
                    title={playTitle}
                >
                    {playLabel}
                </button>
                <button
                    className="ghost"
                    onClick={onNewAdventure}
                    disabled={!gameRoot}
                    title="Create a new adventure from a module file."
                >
                    + New
                </button>
            </div>
            <div className="spacer" />
            <div className={`conn ${connected ? "" : "disconnected"}`}>
                <div className="dot" />
                {connected ? "Connected" : "Disconnected"}
            </div>
        </div>
    );
}

function truncatePath(p: string, max: number): string {
    if (p.length <= max) return p;
    return "…" + p.slice(p.length - max + 1);
}
