import { useEffect, useRef } from "react";
import { api, isTimeoutError } from "./api";
import type { AdventureSnapshot } from "./types";

interface PollerOptions {
    gameRoot: string | null;
    adventureName: string | null;
    snapshot: AdventureSnapshot | null;
    onUpdate: (next: AdventureSnapshot) => void;
    onError: (err: unknown) => void;
    onConnectionLost: () => void;
    pausedRef: React.MutableRefObject<boolean>;
    intervalMs?: number;
}

// mtime-gated poller: re-fetches an adventure snapshot every interval, but
// only swaps state if any tracked file's mtime changed. `pausedRef` lets the
// UI temporarily disable polling while the user is editing a focused field
// or interacting with combat controls so we never clobber dirty state.
//
// In-flight & ordering: `inFlightRef` skips a tick if the previous poll has
// not returned. `seqRef` discards out-of-order responses if the underlying
// adventure changes during a long round-trip.
export function useAdventurePoller(options: PollerOptions) {
    const {
        gameRoot,
        adventureName,
        snapshot,
        onUpdate,
        onError,
        onConnectionLost,
        pausedRef,
        intervalMs = 3000,
    } = options;

    const snapshotRef = useRef(snapshot);
    snapshotRef.current = snapshot;
    const inFlightRef = useRef(false);

    useEffect(() => {
        if (!gameRoot || !adventureName) return;
        let cancelled = false;
        let seq = 0;
        const myKey = `${gameRoot}::${adventureName}`;
        const tick = async () => {
            if (cancelled || pausedRef.current || inFlightRef.current) return;
            const current = snapshotRef.current;
            if (!current) return;
            inFlightRef.current = true;
            const mySeq = ++seq;
            try {
                const result = await api.pollAdventure(
                    gameRoot,
                    adventureName,
                    current.mtimes,
                );
                if (cancelled || mySeq !== seq) return;
                if (result.changed && result.snapshot) {
                    onUpdate(result.snapshot);
                }
            } catch (e) {
                if (cancelled || mySeq !== seq) return;
                if (isTimeoutError(e)) onConnectionLost();
                else onError(e);
            } finally {
                inFlightRef.current = false;
            }
            void myKey;
        };
        const handle = setInterval(tick, intervalMs);
        return () => {
            cancelled = true;
            clearInterval(handle);
            // Bump seq so any in-flight response from the previous adventure
            // is discarded by the next handler that runs.
            seq++;
        };
    }, [gameRoot, adventureName, intervalMs, onUpdate, onError, onConnectionLost, pausedRef]);
}

// Periodic ping to detect dead WebSocket. The bridge has no built-in close
// signal, so we use a 3s-timeout ping every 5s; two consecutive failures flip
// the connection state.
export function useConnectionMonitor(
    onChange: (connected: boolean) => void,
) {
    useEffect(() => {
        let cancelled = false;
        let consecutiveFailures = 0;
        let connected = true;
        const tick = async () => {
            if (cancelled) return;
            try {
                await api.ping();
                if (cancelled) return;
                consecutiveFailures = 0;
                if (!connected) {
                    connected = true;
                    onChange(true);
                }
            } catch {
                if (cancelled) return;
                consecutiveFailures += 1;
                if (consecutiveFailures >= 2 && connected) {
                    connected = false;
                    onChange(false);
                }
            }
        };
        const handle = setInterval(tick, 5000);
        // Run one immediately so the initial state is honest.
        tick();
        return () => {
            cancelled = true;
            clearInterval(handle);
        };
    }, [onChange]);
}
