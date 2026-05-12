import type { AdventureSnapshot } from "../types";
import { CharacterCard } from "./CharacterCard";

interface Props {
    snapshot: AdventureSnapshot;
}

export function Session({ snapshot }: Props) {
    const { party, session } = snapshot;
    return (
        <div>
            <div className="session-header">
                <div className="field">
                    <div className="key">Location</div>
                    <div className="val">{session.status.location ?? "—"}</div>
                </div>
                <div className="field">
                    <div className="key">Turn / Hour</div>
                    <div className="val">
                        {session.status.turn ?? "—"}
                        {session.status.hour ? ` · ${session.status.hour}` : ""}
                    </div>
                </div>
                <div className="field">
                    <div className="key">Light</div>
                    <div className="val">{session.status.light ?? "—"}</div>
                </div>
            </div>

            {session.situation && (
                <div className="warning" style={{ borderColor: "var(--accent)", color: "var(--text)" }}>
                    <strong style={{ color: "var(--accent)" }}>Current situation: </strong>
                    {session.situation}
                </div>
            )}

            <div className="section-title">
                Party · {party.characters.length} {party.characters.length === 1 ? "member" : "members"}
                <span className="muted" style={{ fontWeight: 400, marginLeft: "0.5rem", fontSize: "0.7rem", letterSpacing: "0.05em" }}>
                    click a row to expand
                </span>
            </div>

            {party.warnings.length > 0 && (
                <div className="warning">
                    {party.warnings.length} parse warning{party.warnings.length === 1 ? "" : "s"}:
                    <ul style={{ marginLeft: "1.5rem", marginTop: "0.3rem" }}>
                        {party.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                </div>
            )}

            {party.characters.length === 0 ? (
                <div className="empty">PARTY.md is empty. Create characters with the bx-referee plugin.</div>
            ) : (
                <div className="party-list">
                    {party.characters.map((c, i) => (
                        <CharacterCard key={`${c.name}-${i}`} character={c} />
                    ))}
                </div>
            )}
        </div>
    );
}
