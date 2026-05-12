import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { AdventureSummary } from "../types";

interface Props {
    gameRoot: string;
    existingNames: readonly string[];
    onClose: () => void;
    onAdventureReady: (name: string) => void;
}

type Phase = "form" | "starting" | "waiting" | "ready" | "error";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 90_000;
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

// Modal that kicks off a new bx-referee adventure. The OSR Game Client
// cannot run the bx-referee skill itself, so we send a structured prompt
// to the agent and watch the filesystem for the new adventure dir to
// appear.
export function NewAdventureModal({
    gameRoot,
    existingNames,
    onClose,
    onAdventureReady,
}: Props) {
    const [name, setName] = useState("");
    const [modulePath, setModulePath] = useState("");
    const [phase, setPhase] = useState<Phase>("form");
    const [errMsg, setErrMsg] = useState<string | null>(null);
    const cancelledRef = useRef(false);

    useEffect(() => () => { cancelledRef.current = true; }, []);

    const validate = (): string | null => {
        const n = name.trim();
        if (!n) return "Adventure name is required.";
        if (!NAME_RE.test(n)) {
            return "Name must be a slug: lowercase letters, digits, and dashes (e.g. \"keep-on-borderlands\").";
        }
        if (existingNames.includes(n)) {
            return "An adventure with that name already exists.";
        }
        if (!modulePath.trim()) return "Module file path is required.";
        return null;
    };

    const start = async () => {
        const err = validate();
        if (err) {
            setErrMsg(err);
            return;
        }
        const finalName = name.trim();
        const finalPath = modulePath.trim();
        setErrMsg(null);
        setPhase("starting");
        try {
            await api.startNewAdventure(gameRoot, finalName, finalPath);
            if (cancelledRef.current) return;
            setPhase("waiting");
            // Poll listAdventures until the new dir appears (or timeout).
            const started = Date.now();
            while (!cancelledRef.current && Date.now() - started < POLL_TIMEOUT_MS) {
                await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
                if (cancelledRef.current) return;
                try {
                    const result = await api.listAdventures(gameRoot);
                    const found = result.adventures.find(
                        (a: AdventureSummary) => a.name === finalName,
                    );
                    if (found) {
                        if (!cancelledRef.current) {
                            setPhase("ready");
                            onAdventureReady(finalName);
                        }
                        return;
                    }
                } catch {
                    // poll error — keep trying
                }
            }
            if (!cancelledRef.current) {
                setPhase("waiting"); // stay in waiting, give the user a manual close option
            }
        } catch (e) {
            if (cancelledRef.current) return;
            setErrMsg((e as Error).message);
            setPhase("error");
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>New adventure</h2>
                    <button className="ghost" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {phase === "form" || phase === "error" ? (
                        <>
                            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                                The OSR Game Client hands these off to the agent, which uses the
                                bx-referee adventure skill to build LOCATIONS.md, PARTY.md, and
                                SESSION.md. Party setup and scene-setting continue in the chat.
                            </p>
                            <div className="form-row">
                                <label>Adventure name (slug)</label>
                                <input
                                    autoFocus
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="keep-on-borderlands"
                                    spellCheck={false}
                                />
                            </div>
                            <div className="form-row">
                                <label>Module file path</label>
                                <input
                                    value={modulePath}
                                    onChange={(e) => setModulePath(e.target.value)}
                                    placeholder="/path/to/keep-on-borderlands.pdf"
                                    spellCheck={false}
                                />
                                <span className="muted" style={{ fontSize: "0.75rem" }}>
                                    Absolute path to a PDF or Markdown adventure module.
                                </span>
                            </div>
                            <div className="form-row">
                                <label>Game root</label>
                                <code style={{ fontSize: "0.85rem" }}>{gameRoot}</code>
                            </div>
                            {errMsg && <div className="warning">{errMsg}</div>}
                        </>
                    ) : null}
                    {phase === "starting" && (
                        <div className="modal-status">
                            <div className="spinner" /> Sending adventure setup to the agent…
                        </div>
                    )}
                    {phase === "waiting" && (
                        <div className="modal-status">
                            <div className="spinner" />
                            <div>
                                <div>The agent is preparing your adventure.</div>
                                <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>
                                    Watch the chat — it may ask you about the party (existing or new
                                    characters) and the opening scene. The OSR Game Client will switch to
                                    the new adventure as soon as its files appear on disk.
                                </div>
                            </div>
                        </div>
                    )}
                    {phase === "ready" && (
                        <div className="modal-status">
                            ✓ Adventure ready. Switching now…
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    {phase === "form" || phase === "error" ? (
                        <>
                            <button className="ghost" onClick={onClose}>Cancel</button>
                            <button className="primary" onClick={start}>Start</button>
                        </>
                    ) : phase === "waiting" ? (
                        <button className="ghost" onClick={onClose}>Close (continue in chat)</button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
