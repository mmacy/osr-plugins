// Typed wrappers around the page-side `window.copilot` Proxy. Every call has a
// timeout so a dead WebSocket (post extensions reload / `/clear`) does not
// hang the UI forever; instead we mark the session as disconnected.

import type {
    AdventureSnapshot,
    AdventureSummary,
    CombatState,
    RollResult,
    Setup,
    SrdContent,
    SrdEntry,
    Mtimes,
} from "./types";

declare const copilot: Record<string, (...args: unknown[]) => Promise<unknown>>;

const DEFAULT_TIMEOUT_MS = 8000;

class TimeoutError extends Error {
    constructor(method: string, ms: number) {
        super(`copilot.${method} timed out after ${ms}ms`);
        this.name = "TimeoutError";
    }
}

export function isTimeoutError(e: unknown): boolean {
    return e instanceof TimeoutError;
}

async function call<T>(
    method: string,
    args: unknown[],
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
    const fn = copilot[method];
    if (typeof fn !== "function") {
        throw new Error(`copilot bridge not ready (missing ${method})`);
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new TimeoutError(method, timeoutMs)),
            timeoutMs,
        );
    });
    try {
        const result = await Promise.race([fn(...args), timeoutPromise]);
        return result as T;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export const api = {
    ping: () => call<{ ok: boolean; at: number }>("ping", [], 3000),
    getSetup: () => call<Setup>("getSetup", []),
    setGameRoot: (path: string) => call<{ gameRoot: string }>("setGameRoot", [path]),
    setPluginRoot: (path: string) => call<{ pluginRoot: string }>("setPluginRoot", [path]),
    listAdventures: (gameRoot: string) =>
        call<{ adventures: AdventureSummary[] }>("listAdventures", [gameRoot]),
    startNewAdventure: (gameRoot: string, name: string, modulePath: string) =>
        call<{ ok: boolean; gameRoot: string; name: string; modulePath: string }>(
            "startNewAdventure",
            [gameRoot, name, modulePath],
            12000,
        ),
    continueAdventure: (gameRoot: string, name: string) =>
        call<{ ok: boolean; gameRoot: string; name: string; isFirstSession: boolean }>(
            "continueAdventure",
            [gameRoot, name],
            12000,
        ),
    loadAdventure: (gameRoot: string, name: string) =>
        call<AdventureSnapshot>("loadAdventure", [gameRoot, name]),
    pollAdventure: (gameRoot: string, name: string, knownMtimes: Mtimes) =>
        call<{ changed: boolean; snapshot?: AdventureSnapshot }>(
            "pollAdventure",
            [gameRoot, name, knownMtimes],
            5000,
        ),
    saveCombatState: (gameRoot: string, name: string, state: CombatState) =>
        call<{ savedAt: string }>("saveCombatState", [gameRoot, name, state]),
    setLocationVisited: (
        gameRoot: string,
        name: string,
        locId: string,
        status: "visited" | "cleared" | null,
    ) => call<unknown>("setLocationVisited", [gameRoot, name, locId, status]),
    appendNote: (gameRoot: string, name: string, entry: string) =>
        call<{ savedAt: string }>("appendNote", [gameRoot, name, entry]),
    rollDice: (expr: string) =>
        call<RollResult>("rollDice", [expr], 6000),
    searchSrd: (query: string) =>
        call<{ entries: SrdEntry[] }>("searchSrd", [query]),
    readSrd: (file: string) => call<SrdContent>("readSrd", [file]),
    sendChat: (prompt: string) => call<{ ok: boolean }>("sendChat", [prompt], 8000),
    respondElicitation: (id: string, result: ElicitationResult) =>
        call<{ ok: boolean }>("respondElicitation", [id, result]),
    setActiveAdventure: (gameRoot: string | null, name: string | null) =>
        call<{ active: string | null }>("setActiveAdventure", [gameRoot, name]),
    loadChatTranscript: (gameRoot: string, name: string, limit?: number) =>
        call<{ events: ChatEvent[] }>("loadChatTranscript", [gameRoot, name, limit ?? 200]),
};

// ---------- chat event types ----------

export interface ChatEvent {
    kind:
        | "assistant.message"
        | "assistant.message_delta"
        | "user.message"
        | "tool.start"
        | "tool.complete"
        | "thinking.start"
        | "thinking.end"
        | "elicitation.expired";
    messageId?: string;
    content?: string;
    html?: string;
    delta?: string;
    source?: string | null;
    toolCallId?: string;
    toolName?: string;
    icon?: string;
    argsSummary?: string;
    success?: boolean;
    errorMessage?: string;
    turnId?: string;
    elicitationId?: string;
    reason?: string;
    timestamp?: string;
    /** Set on persisted-then-replayed events from the transcript sidecar. */
    _at?: number;
    /** Set on optimistic items so we can reconcile/retry. */
    _localId?: string;
}

export type ElicitationFieldValue = string | number | boolean | string[];

export interface ElicitationResult {
    action: "accept" | "decline" | "cancel";
    content?: Record<string, ElicitationFieldValue>;
}

export interface ElicitationFieldSchema {
    type: "string" | "number" | "integer" | "boolean" | "array";
    title?: string;
    description?: string;
    enum?: string[];
    enumNames?: string[];
    oneOf?: { const: string; title: string }[];
    items?: ElicitationFieldSchema | { enum?: string[]; type?: string; anyOf?: { const: string; title: string }[] };
    minItems?: number;
    maxItems?: number;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    default?: ElicitationFieldValue;
    format?: "email" | "uri" | "date" | "date-time";
}

export interface ElicitationSchema {
    properties: Record<string, ElicitationFieldSchema>;
    required?: string[];
}

export interface ElicitationRequest {
    id: string;
    message: string;
    requestedSchema: ElicitationSchema | null;
    mode: "form" | "url";
    elicitationSource: string | null;
    url: string | null;
}
