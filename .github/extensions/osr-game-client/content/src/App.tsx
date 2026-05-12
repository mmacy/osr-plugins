import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import {
    useAdventurePoller,
    useConnectionMonitor,
} from "./hooks";
import type {
    AdventureSnapshot,
    AdventureSummary,
    Setup,
} from "./types";
import type { ChatEvent } from "./api";
import { SetupChecklist } from "./components/SetupChecklist";
import { DisconnectBanner } from "./components/DisconnectBanner";
import { Topbar } from "./components/Topbar";
import { Session } from "./components/Session";
import { CombatTracker } from "./components/CombatTracker";
import { DiceRoller } from "./components/DiceRoller";
import { Locations } from "./components/Locations";
import { SessionLog } from "./components/SessionLog";
import { SrdLookup } from "./components/SrdLookup";
import { NewAdventureModal } from "./components/NewAdventureModal";
import { ChatPanel } from "./components/ChatPanel";

type TabId = "session" | "combat" | "dice" | "locations" | "log" | "srd";

const TABS: { id: TabId; label: string }[] = [
    { id: "session", label: "Session" },
    { id: "combat", label: "Combat" },
    { id: "dice", label: "Dice" },
    { id: "locations", label: "Locations" },
    { id: "log", label: "Session log" },
    { id: "srd", label: "SRD" },
];

const SUGGESTED_GAME_ROOT = "~/osr-games";
const ADVENTURES_POLL_MS = 5000;

export function App() {
    const [setup, setSetup] = useState<Setup | null>(null);
    const [setupComplete, setSetupComplete] = useState(false);
    const [forceShowSetup, setForceShowSetup] = useState(false);
    const [gameRoot, setGameRoot] = useState<string | null>(null);
    const [adventures, setAdventures] = useState<AdventureSummary[]>([]);
    const [adventureName, setAdventureName] = useState<string | null>(null);
    const [snapshot, setSnapshot] = useState<AdventureSnapshot | null>(null);
    const [tab, setTab] = useState<TabId>("session");
    const [connected, setConnected] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showNewAdventure, setShowNewAdventure] = useState(false);
    const [playBusy, setPlayBusy] = useState(false);
    const [transcriptSeed, setTranscriptSeed] = useState<ChatEvent[] | null>(null);
    // Chat-panel width (resizable). Persisted in localStorage; clamped each
    // render so a bad value (or a smaller window) can't trap it offscreen.
    const [chatWidth, setChatWidth] = useState<number>(() => {
        const stored = parseInt(localStorage.getItem("bxref.chatWidth") ?? "", 10);
        return Number.isFinite(stored) ? stored : 420;
    });
    const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

    const onSplitterPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        dragStateRef.current = { startX: e.clientX, startWidth: chatWidth };
        document.body.style.cursor = "col-resize";
    };
    const onSplitterPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag) return;
        const delta = drag.startX - e.clientX;
        const max = Math.max(320, window.innerWidth - 400);
        const next = Math.max(280, Math.min(max, drag.startWidth + delta));
        setChatWidth(next);
    };
    const onSplitterPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragStateRef.current) return;
        try { localStorage.setItem("bxref.chatWidth", String(chatWidth)); } catch { /* ignore */ }
        dragStateRef.current = null;
        document.body.style.cursor = "";
        try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    };

    const pausedRef = useRef(false);
    const pausePolling = useCallback((paused: boolean) => {
        pausedRef.current = paused;
    }, []);

    // ---- bootstrap: fetch setup once and decide whether to show checklist
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const s = await api.getSetup();
                if (cancelled) return;
                setSetup(s);
                const ok = !!s.lastGameRoot && s.pluginRootValid && s.rollProbe.ok && s.srdProbe.ok;
                setSetupComplete(ok);
                if (ok && s.lastGameRoot) setGameRoot(s.lastGameRoot);
            } catch (e) {
                if (cancelled) return;
                setError((e as Error).message);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ---- list adventures whenever the game root changes (initial fetch)
    useEffect(() => {
        if (!gameRoot) {
            setAdventures([]);
            setAdventureName(null);
            setSnapshot(null);
            return;
        }
        let cancelled = false;
        // Reset prior adventure when the root changes — it may not exist
        // under the new root.
        setAdventureName(null);
        setSnapshot(null);
        (async () => {
            try {
                const r = await api.listAdventures(gameRoot);
                if (cancelled) return;
                setAdventures(r.adventures);
                if (r.adventures.length === 1) {
                    setAdventureName(r.adventures[0].name);
                }
            } catch (e) {
                if (cancelled) return;
                setError((e as Error).message);
            }
        })();
        return () => { cancelled = true; };
    }, [gameRoot]);

    // ---- periodic adventures-list refresh so externally-created adventures
    // (e.g. via the bx-referee skill in chat) appear in the dropdown without
    // user action.
    useEffect(() => {
        if (!gameRoot) return;
        let cancelled = false;
        const tick = async () => {
            if (cancelled || pausedRef.current) return;
            try {
                const r = await api.listAdventures(gameRoot);
                if (cancelled) return;
                // Only update if the membership actually changed; avoid pointless rerenders.
                setAdventures((prev) => {
                    if (prev.length !== r.adventures.length) return r.adventures;
                    const sameNames = prev.every((p, i) => p.name === r.adventures[i].name);
                    if (!sameNames) return r.adventures;
                    return prev;
                });
            } catch {
                // ignore; the per-adventure poller will surface connection issues
            }
        };
        const handle = setInterval(tick, ADVENTURES_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(handle);
        };
    }, [gameRoot]);

    // ---- load adventure when its name changes
    useEffect(() => {
        if (!gameRoot || !adventureName) {
            setSnapshot(null);
            setTranscriptSeed(null);
            // Clear server-side active-adventure tracking so chat events
            // stop being persisted.
            api.setActiveAdventure(null, null).catch(() => {});
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const [snap, transcript] = await Promise.all([
                    api.loadAdventure(gameRoot, adventureName),
                    api.loadChatTranscript(gameRoot, adventureName, 200),
                ]);
                if (cancelled) return;
                setSnapshot(snap);
                setTranscriptSeed(transcript.events);
                // NOTE: we deliberately do NOT call setActiveAdventure here.
                // Persistence kicks in only when the user clicks ▶ Play or
                // ▶ Resume — until then, the OSR Game Client is read-only and
                // any agent activity belongs to whatever non-game work is in
                // progress, not the loaded adventure's transcript.
                api.setActiveAdventure(null, null).catch(() => {});
            } catch (e) {
                if (cancelled) return;
                setError((e as Error).message);
            }
        })();
        return () => { cancelled = true; };
    }, [gameRoot, adventureName]);

    // ---- live poll
    useAdventurePoller({
        gameRoot,
        adventureName,
        snapshot,
        onUpdate: setSnapshot,
        onError: (e) => setError((e as Error).message ?? String(e)),
        onConnectionLost: () => setConnected(false),
        pausedRef,
    });

    // ---- ping-based connection monitor
    useConnectionMonitor(setConnected);

    const onSetupChanged = (next: Setup) => {
        setSetup(next);
        const ok = !!next.lastGameRoot && next.pluginRootValid && next.rollProbe.ok && next.srdProbe.ok;
        setSetupComplete(ok);
        if (ok && next.lastGameRoot) {
            setGameRoot(next.lastGameRoot);
            setForceShowSetup(false);
        }
    };

    const onPlay = async () => {
        if (!gameRoot || !adventureName || playBusy) return;
        setPlayBusy(true);
        try {
            // Pressing Play / Resume officially enters play mode for this
            // adventure. From now on, chat events get persisted to the
            // adventure's chat.jsonl sidecar. (Cleared in the load-adventure
            // effect when the player switches adventures or closes the panel.)
            await api.setActiveAdventure(gameRoot, adventureName);
            await api.continueAdventure(gameRoot, adventureName);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPlayBusy(false);
        }
    };

    // "Continue" if the loaded adventure has at least one session log entry.
    // Otherwise it's a fresh adventure → "Play" (== begin).
    const isContinue = !!snapshot && snapshot.session.log.length > 0;

    if (!setup) {
        return (
            <div className="app">
                <DisconnectBanner visible={!connected} />
                <div className="empty">Loading…</div>
            </div>
        );
    }

    if (!setupComplete || forceShowSetup) {
        return (
            <div className="app">
                <DisconnectBanner visible={!connected} />
                <SetupChecklist
                    setup={setup}
                    onSetupChanged={onSetupChanged}
                    suggestedGameRoot={SUGGESTED_GAME_ROOT}
                />
            </div>
        );
    }

    return (
        <div className="app">
            <DisconnectBanner visible={!connected} />
            <Topbar
                gameRoot={gameRoot}
                adventures={adventures}
                adventureName={adventureName}
                onChangeAdventure={(n) => setAdventureName(n || null)}
                onChangeGameRoot={() => setForceShowSetup(true)}
                onNewAdventure={() => setShowNewAdventure(true)}
                onPlay={onPlay}
                isContinue={isContinue}
                playBusy={playBusy}
                connected={connected}
            />
            <div className="body-split">
                <div className="tab-area">
                    <div className="tabs">
                        {TABS.map((t) => (
                            <button
                                key={t.id}
                                className={`tab ${tab === t.id ? "active" : ""}`}
                                onClick={() => setTab(t.id)}
                            >
                                {t.label}
                                {t.id === "combat" && snapshot && snapshot.combat.combatants.length > 0 && (
                                    <span className="count">{snapshot.combat.combatants.length}</span>
                                )}
                                {t.id === "locations" && snapshot && snapshot.locations.sections.length > 0 && (
                                    <span className="count">
                                        {snapshot.locations.sections.reduce((n, s) => n + s.entries.length, 0)}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="main">
                        {error && (
                            <div className="warning">
                                {error}{" "}
                                <button className="ghost" onClick={() => setError(null)}>dismiss</button>
                            </div>
                        )}
                        {!snapshot ? (
                            <div className="empty">
                                {adventures.length === 0
                                    ? <>No adventures found in this game root. Click <strong>+ New</strong> above to start one.</>
                                    : "Select an adventure from the dropdown above, or click + New to start one."}
                            </div>
                        ) : (
                            <>
                                {tab === "session" && <Session snapshot={snapshot} />}
                                {tab === "combat" && gameRoot && adventureName && (
                                    <CombatTracker
                                        snapshot={snapshot}
                                        gameRoot={gameRoot}
                                        adventureName={adventureName}
                                        onSnapshotChange={setSnapshot}
                                        pausePolling={pausePolling}
                                    />
                                )}
                                {tab === "dice" && <DiceRoller />}
                                {tab === "locations" && gameRoot && adventureName && (
                                    <Locations
                                        snapshot={snapshot}
                                        gameRoot={gameRoot}
                                        adventureName={adventureName}
                                        onSnapshotChange={setSnapshot}
                                    />
                                )}
                                {tab === "log" && gameRoot && adventureName && (
                                    <SessionLog
                                        snapshot={snapshot}
                                        gameRoot={gameRoot}
                                        adventureName={adventureName}
                                        onSnapshotChange={setSnapshot}
                                        pausePolling={pausePolling}
                                    />
                                )}
                                {tab === "srd" && <SrdLookup />}
                            </>
                        )}
                    </div>
                </div>
                <div
                    className="splitter"
                    onPointerDown={onSplitterPointerDown}
                    onPointerMove={onSplitterPointerMove}
                    onPointerUp={onSplitterPointerUp}
                    onPointerCancel={onSplitterPointerUp}
                    role="separator"
                    aria-orientation="vertical"
                    title="Drag to resize"
                />
                <ChatPanel
                    connected={connected}
                    width={chatWidth}
                    adventureKey={adventureName}
                    transcriptSeed={transcriptSeed}
                />
            </div>

            {showNewAdventure && gameRoot && (
                <NewAdventureModal
                    gameRoot={gameRoot}
                    existingNames={adventures.map((a) => a.name)}
                    onClose={() => setShowNewAdventure(false)}
                    onAdventureReady={(n) => {
                        setShowNewAdventure(false);
                        setAdventureName(n);
                        // The new-adventure flow already counts as "in
                        // play": the agent is mid-creation and will start
                        // narrating immediately, so kick on persistence.
                        if (gameRoot) {
                            api.setActiveAdventure(gameRoot, n).catch(() => {});
                        }
                    }}
                />
            )}
        </div>
    );
}
