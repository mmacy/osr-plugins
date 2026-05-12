import { useState } from "react";
import { api } from "../api";
import type { AdventureSnapshot } from "../types";

interface Props {
    snapshot: AdventureSnapshot;
    gameRoot: string;
    adventureName: string;
    onSnapshotChange: (next: AdventureSnapshot) => void;
    pausePolling: (paused: boolean) => void;
}

// Read-only display of SESSION.md log + a separate "player notes" sidecar
// editor. Notes go to <adventure>/.osr-game-client/notes.md, NOT into
// SESSION.md, so the bx-referee plugin's freeform format is never touched.
export function SessionLog({
    snapshot,
    gameRoot,
    adventureName,
    onSnapshotChange,
    pausePolling,
}: Props) {
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!draft.trim()) return;
        setBusy(true);
        setError(null);
        pausePolling(true);
        try {
            await api.appendNote(gameRoot, adventureName, draft);
            // Optimistically append to the local notes blob; the next poll
            // will reconcile from disk.
            const stamp = new Date().toISOString();
            const block = `\n\n## ${stamp}\n\n${draft}\n`;
            const nextNotes = (snapshot.notes || "# Player notes\n\n") + block;
            onSnapshotChange({ ...snapshot, notes: nextNotes });
            setDraft("");
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
            pausePolling(false);
        }
    };

    return (
        <div className="log">
            <div className="entries">
                {snapshot.session.log.length === 0 ? (
                    <div className="empty">No session log entries yet.</div>
                ) : snapshot.session.log.map((e, i) => (
                    <div key={i} className="entry">
                        <h3>{e.heading}</h3>
                        <p>{e.body}</p>
                    </div>
                ))}

                {snapshot.session.casualties.length > 0 && (
                    <div className="casualties">
                        <h4>Casualties</h4>
                        {snapshot.session.casualties.map((c, i) => (
                            <div key={i} className="casualty">
                                {c.name} ({c.class}) — {c.cause} · session {c.session}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="right">
                <h3>Player notes</h3>
                <div className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.3rem" }}>
                    Notes are saved to a sidecar <code>notes.md</code> alongside
                    the adventure. They do <strong>not</strong> modify
                    SESSION.md.
                </div>
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Take a note…"
                />
                <div className="row">
                    <button
                        className="primary"
                        onClick={submit}
                        disabled={busy || !draft.trim()}
                    >
                        {busy ? "Saving…" : "Append note"}
                    </button>
                    {error && <span className="warning" style={{ margin: 0 }}>{error}</span>}
                </div>
                {snapshot.notes && (
                    <div className="notes-render">{snapshot.notes}</div>
                )}
            </div>
        </div>
    );
}
