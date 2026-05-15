import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { AdventureSnapshot, CombatState, Combatant } from "../types";

interface Props {
    snapshot: AdventureSnapshot;
    gameRoot: string;
    adventureName: string;
    onSnapshotChange: (next: AdventureSnapshot) => void;
    pausePolling: (paused: boolean) => void;
}

const COMMON_CONDITIONS = ["sleep", "hold", "stun", "fear", "ENT", "down"];

function rid(): string {
    return Math.random().toString(36).slice(2, 10);
}

// The combat tracker is explicitly "encounter-local" — its HP values do not
// flow back into PARTY.md. The snapshot-from-party action seeds initial HP,
// but from then on it's a separate ledger. Persistence is to the sidecar
// `.osr-game-client/combat.json` only.
//
// All mutations go through `mutate()`, which:
//   1. Computes next state from a *current* draft (avoids stale closure).
//   2. Updates local state synchronously.
//   3. Persists to disk via a serialized queue so rapid clicks can't
//      interleave (last-writer-wins would lose decrements).
//   4. Surfaces errors and resets the dirty flag in finally.
export function CombatTracker({
    snapshot,
    gameRoot,
    adventureName,
    onSnapshotChange,
    pausePolling,
}: Props) {
    const [draft, setDraft] = useState<CombatState>(snapshot.combat);
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const [newName, setNewName] = useState("");
    const [newInit, setNewInit] = useState("");
    const [newHp, setNewHp] = useState("");
    const [newAc, setNewAc] = useState("");
    const [error, setError] = useState<string | null>(null);
    const dirtyRef = useRef(false);
    const writeChainRef = useRef<Promise<void>>(Promise.resolve());

    // Re-seed local draft when the on-disk combat state changes underneath us,
    // but only when no local mutation is dirty.
    useEffect(() => {
        if (!dirtyRef.current) {
            setDraft(snapshot.combat);
        }
    }, [snapshot.combat]);

    const mutate = (updater: (current: CombatState) => CombatState) => {
        // Compute next from the *current* ref so concurrent clicks compound.
        const next = updater(draftRef.current);
        draftRef.current = next;
        setDraft(next);
        dirtyRef.current = true;
        pausePolling(true);
        const prev = writeChainRef.current;
        const job = (async () => {
            await prev;
            try {
                await api.saveCombatState(gameRoot, adventureName, next);
            } catch (e) {
                setError(`Could not save combat state: ${(e as Error).message}`);
            }
        })();
        writeChainRef.current = job;
        // Only the *latest* enqueued write releases the dirty flag and
        // notifies the parent. Earlier completions noop, which preserves
        // the invariant that polling stays paused while writes are queued.
        job.then(() => {
            if (writeChainRef.current === job) {
                onSnapshotChange({ ...snapshot, combat: draftRef.current });
                dirtyRef.current = false;
                pausePolling(false);
            }
        });
    };

    const sortedByInit = [...draft.combatants].sort(
        (a, b) => b.initiative - a.initiative,
    );

    const snapshotFromParty = () => {
        const partyCombatants: Combatant[] = snapshot.party.characters
            .filter((c) => c.status !== "DEAD")
            .map((c) => ({
                id: rid(),
                name: c.name,
                initiative: 0,
                hpCurrent: c.combatStats?.hpCurrent ?? 0,
                hpMax: c.combatStats?.hpMax ?? 0,
                ac: c.combatStats?.ac ?? null,
                isPC: true,
                conditions: [],
            }));
        mutate((cur) => ({
            ...cur,
            round: 1,
            active: -1,
            combatants: [
                ...cur.combatants.filter((c) => !c.isPC),
                ...partyCombatants,
            ],
        }));
    };

    const addCombatant = () => {
        if (!newName.trim()) return;
        const hpVal = parseInt(newHp, 10);
        const initVal = parseInt(newInit, 10);
        const acVal = parseInt(newAc, 10);
        const safeHp = Number.isNaN(hpVal) ? 1 : Math.max(1, hpVal);
        mutate((cur) => ({
            ...cur,
            combatants: [
                ...cur.combatants,
                {
                    id: rid(),
                    name: newName.trim(),
                    initiative: Number.isNaN(initVal) ? 0 : initVal,
                    hpCurrent: safeHp,
                    hpMax: safeHp,
                    ac: Number.isNaN(acVal) ? null : acVal,
                    isPC: false,
                    conditions: [],
                },
            ],
        }));
        setNewName("");
        setNewInit("");
        setNewHp("");
        setNewAc("");
    };

    const removeCombatant = (id: string) => {
        mutate((cur) => ({
            ...cur,
            combatants: cur.combatants.filter((c) => c.id !== id),
        }));
    };

    const updateHp = (id: string, delta: number) => {
        mutate((cur) => ({
            ...cur,
            combatants: cur.combatants.map((c) =>
                c.id === id
                    ? { ...c, hpCurrent: Math.max(0, Math.min(c.hpMax, c.hpCurrent + delta)) }
                    : c
            ),
        }));
    };

    const setHpExact = (id: string, value: number) => {
        mutate((cur) => ({
            ...cur,
            combatants: cur.combatants.map((c) =>
                c.id === id ? { ...c, hpCurrent: Math.max(0, value) } : c
            ),
        }));
    };

    const toggleCondition = (id: string, cond: string) => {
        mutate((cur) => ({
            ...cur,
            combatants: cur.combatants.map((c) =>
                c.id === id
                    ? {
                        ...c,
                        conditions: c.conditions.includes(cond)
                            ? c.conditions.filter((x) => x !== cond)
                            : [...c.conditions, cond],
                    }
                    : c
            ),
        }));
    };

    const advance = () => {
        if (sortedByInit.length === 0) return;
        const total = sortedByInit.length;
        mutate((cur) => {
            let nextActive = cur.active + 1;
            let nextRound = cur.round;
            if (nextActive >= total) {
                nextActive = 0;
                nextRound += 1;
            }
            if (cur.active < 0) nextActive = 0;
            return { ...cur, active: nextActive, round: nextRound };
        });
    };

    const resetCombat = () => {
        mutate(() => ({ schemaVersion: 1, round: 1, active: -1, combatants: [] }));
    };

    const activeId = sortedByInit[draft.active]?.id;

    return (
        <div className="combat">
            <div className="roster">
                <div className="warning">
                    <strong>Encounter-local.</strong> HP and conditions here are tracked
                    separately from <code>PARTY.md</code>. Use the agent / bx-referee
                    flow to commit final HP after the encounter.
                </div>
                {error && (
                    <div className="warning">
                        {error}{" "}
                        <button className="ghost" onClick={() => setError(null)}>dismiss</button>
                    </div>
                )}
                {sortedByInit.length === 0 ? (
                    <div className="empty-roster">
                        No combatants yet. Use <em>Snapshot from party</em> or add monsters on the right.
                    </div>
                ) : sortedByInit.map((c) => {
                    const down = c.hpCurrent <= 0;
                    const active = c.id === activeId;
                    return (
                        <CombatantRow
                            key={c.id}
                            c={c}
                            active={active}
                            down={down}
                            conditions={COMMON_CONDITIONS}
                            onAdjustHp={(delta) => updateHp(c.id, delta)}
                            onSetHpExact={(v) => setHpExact(c.id, v)}
                            onToggleCondition={(cond) => toggleCondition(c.id, cond)}
                            onRemove={() => removeCombatant(c.id)}
                        />
                    );
                })}
            </div>

            <div className="controls">
                <div className="round">
                    Round <span className="num">{draft.round}</span>
                </div>
                <button className="primary" onClick={advance} disabled={sortedByInit.length === 0}>
                    {draft.active < 0 ? "Begin" : "Next turn ▶"}
                </button>
                <button className="ghost" onClick={snapshotFromParty}>
                    Snapshot from party
                </button>
                <button className="danger" onClick={resetCombat}>Reset combat</button>

                <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.5rem", paddingTop: "0.6rem" }}>
                    <div className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                        Add combatant
                    </div>
                    <div className="add-form">
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Goblin"
                        />
                        <input
                            value={newInit}
                            onChange={(e) => setNewInit(e.target.value)}
                            placeholder="init"
                            type="number"
                        />
                        <input
                            value={newHp}
                            onChange={(e) => setNewHp(e.target.value)}
                            placeholder="hp"
                            type="number"
                        />
                        <button className="primary" onClick={addCombatant}>+</button>
                    </div>
                    <input
                        style={{ marginTop: "0.3rem", width: "100%" }}
                        value={newAc}
                        onChange={(e) => setNewAc(e.target.value)}
                        placeholder="AC (optional)"
                        type="number"
                    />
                </div>
            </div>
        </div>
    );
}

// Per-row HP input is a controlled input that disables polling-driven
// resets while focused so the user's typing isn't clobbered. On blur, it
// commits the parsed integer through `onSetHpExact`.
function CombatantRow(props: {
    c: Combatant;
    active: boolean;
    down: boolean;
    conditions: readonly string[];
    onAdjustHp: (delta: number) => void;
    onSetHpExact: (v: number) => void;
    onToggleCondition: (cond: string) => void;
    onRemove: () => void;
}) {
    const { c, active, down, conditions, onAdjustHp, onSetHpExact, onToggleCondition, onRemove } = props;
    const [focused, setFocused] = useState(false);
    const [draft, setDraft] = useState(String(c.hpCurrent));
    useEffect(() => {
        if (!focused) setDraft(String(c.hpCurrent));
    }, [c.hpCurrent, focused]);

    return (
        <div className={`combatant ${active ? "active" : ""} ${down ? "down" : ""}`}>
            <div className="init">{c.initiative}</div>
            <div className="meta">
                <div className="name">
                    {c.name}
                    <span className="badge" style={{ marginLeft: "0.4rem" }}>
                        {c.isPC ? "PC" : "Foe"}
                    </span>
                </div>
                <div className="info">
                    HP {c.hpCurrent}/{c.hpMax}
                    {c.ac != null && <> · AC {c.ac}</>}
                </div>
                <div className="conditions">
                    {conditions.map((cond) => (
                        <span
                            key={cond}
                            className="condition"
                            onClick={() => onToggleCondition(cond)}
                            style={{ opacity: c.conditions.includes(cond) ? 1 : 0.35 }}
                            title="Click to toggle"
                        >
                            {cond}
                        </span>
                    ))}
                </div>
            </div>
            <div className="hp-controls">
                <button onClick={() => onAdjustHp(-1)} title="-1 HP">−1</button>
                <button onClick={() => onAdjustHp(-5)} title="-5 HP">−5</button>
                <input
                    type="number"
                    value={draft}
                    onFocus={() => setFocused(true)}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={(e) => {
                        setFocused(false);
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v) && v !== c.hpCurrent) onSetHpExact(v);
                        else setDraft(String(c.hpCurrent));
                    }}
                />
                <button onClick={() => onAdjustHp(1)} title="+1 HP">+1</button>
            </div>
            <button
                className="ghost"
                onClick={onRemove}
                title="Remove combatant"
            >
                ✕
            </button>
        </div>
    );
}
