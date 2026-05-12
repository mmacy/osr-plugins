import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import type { RollResult } from "../types";

interface HistoryEntry {
    expr: string;
    output: string;
    error?: string;
    at: string;
}

const QUICK_ROLLS: { label: string; expr: string }[] = [
    { label: "d4", expr: "1d4" },
    { label: "d6", expr: "1d6" },
    { label: "d8", expr: "1d8" },
    { label: "d10", expr: "1d10" },
    { label: "d12", expr: "1d12" },
    { label: "d20", expr: "1d20" },
    { label: "d100", expr: "1d100" },
    { label: "2d6 reaction", expr: "2d6" },
    { label: "Init (1d6/side)", expr: "1d6" },
    { label: "Stats 3d6×6", expr: "3d6x6" },
    { label: "Stats 4d6L×6", expr: "4d6Lx6" },
    { label: "Starting gold", expr: "3d6*10" },
    { label: "Reroll 1 stat", expr: "3d6" },
    { label: "Save (vs ↓)", expr: "1d20" },
    { label: "Morale 2d6", expr: "2d6" },
    { label: "Wand. monster", expr: "1d6" },
];

export function DiceRoller() {
    const [expr, setExpr] = useState("1d20");
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const runRoll = async (e: string) => {
        if (!e.trim()) return;
        setBusy(true);
        try {
            const result: RollResult = await api.rollDice(e);
            const entry: HistoryEntry = {
                expr: e,
                output: result.output ?? "",
                error: result.ok ? undefined : (result.error ?? "unknown error"),
                at: new Date().toLocaleTimeString(),
            };
            setHistory((prev) => [entry, ...prev].slice(0, 100));
        } finally {
            setBusy(false);
        }
    };

    const onSubmit = (ev: React.FormEvent) => {
        ev.preventDefault();
        runRoll(expr);
    };

    return (
        <div className="dice">
            <div className="left">
                <form onSubmit={onSubmit}>
                    <div className="input-row">
                        <input
                            ref={inputRef}
                            value={expr}
                            onChange={(e) => setExpr(e.target.value)}
                            placeholder="e.g. 1d20+2 or 3d6x6"
                            spellCheck={false}
                        />
                        <button className="primary" type="submit" disabled={busy}>
                            {busy ? "Rolling…" : "Roll"}
                        </button>
                        <button
                            type="button"
                            className="ghost"
                            onClick={() => setHistory([])}
                            disabled={history.length === 0}
                        >
                            Clear
                        </button>
                    </div>
                </form>
                <div className="palette">
                    {QUICK_ROLLS.map((q) => (
                        <button
                            key={q.label}
                            type="button"
                            onClick={() => {
                                setExpr(q.expr);
                                runRoll(q.expr);
                            }}
                            disabled={busy}
                        >
                            {q.label}
                        </button>
                    ))}
                </div>
                <div className="history">
                    {history.length === 0 ? (
                        <div className="muted center" style={{ padding: "1rem" }}>
                            No rolls yet. Hit Enter or pick a quick roll.
                        </div>
                    ) : history.map((h, i) => (
                        <div key={i} className={`roll ${h.error ? "error" : ""}`}>
                            <div>
                                <span className="muted" style={{ fontSize: "0.7rem" }}>{h.at}</span>{" "}
                                <span className="expr">{h.expr}</span>
                                <span className="arrow">→</span>
                                <span className="out">{h.error ?? h.output}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="right">
                <h3>Notation cheat sheet</h3>
                <ul>
                    <li><code>NdM</code> — N dice of size M (e.g. <code>3d6</code>)</li>
                    <li><code>L</code> — drop the lowest die (e.g. <code>4d6L</code>)</li>
                    <li><code>+X / -X</code> — modifier (e.g. <code>1d20+2</code>)</li>
                    <li><code>xN</code> — repeat N times (e.g. <code>3d6x6</code>)</li>
                    <li><code>*N</code> — multiply (e.g. <code>3d6*10</code>)</li>
                </ul>
                <h3>Saving throws</h3>
                <p>OSE saves are roll-over: <code>1d20</code> ≥ target. Use the
                    palette's d20 and compare to the SAVES grid on the
                    Session tab.</p>
                <h3>About</h3>
                <p>
                    Rolls go through the bx-referee plugin's <code>roll.py</code>{" "}
                    so the OSR Game Client never disagrees with what the agent rolls.
                </p>
            </div>
        </div>
    );
}
