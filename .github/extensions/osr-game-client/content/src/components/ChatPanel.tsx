import {
    KeyboardEvent,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { api } from "../api";
import type {
    ChatEvent,
    ElicitationFieldValue,
    ElicitationRequest,
    ElicitationResult,
    ElicitationSchema,
} from "../api";
import { subscribeElicitations, subscribeEvents } from "../chatBus";

interface Props {
    connected: boolean;
    width: number;
    /** Adventure key for draft persistence and transcript loading. null when no adventure is loaded. */
    adventureKey: string | null;
    /** When this changes, the panel reseeds its feed from the persisted transcript. */
    transcriptSeed: ChatEvent[] | null;
}

const VISIBLE_FEED_CAP = 1500;
const BUFFER_FEED_CAP = 3000;
const STICKY_THRESHOLD = 64;
const VERBOSE_KEY = "osr-game-client.chat.verbose";
const DRAFT_KEY_PREFIX = "osr-game-client.chat.draft.";
let localStorageWarned = false;

function warnLocalStorageFailure(action: string, e: unknown): void {
    if (localStorageWarned) return;
    localStorageWarned = true;
    console.warn(`[osr-game-client] localStorage ${action} failed`, e);
}

// One feed item — either rendered chat content or a tool-call hint or an
// elicitation form. The feed is built up by reducing ChatEvents from the
// extension event bus.
interface FeedItem {
    id: string;
    kind: "user" | "assistant" | "tool" | "elicitation" | "system";
    text?: string;
    html?: string;
    icon?: string;
    toolName?: string;
    toolCallId?: string;
    argsSummary?: string;
    status?: "running" | "ok" | "error";
    elicitation?: ElicitationRequest;
    timestamp?: string;
    /** For user messages: optional source tag (set when synthetic / skill-injected). */
    source?: string | null;
    /** True once a full assistant.message has landed; later deltas are ignored. */
    complete?: boolean;
    /** Optimistic-send pending state: "pending" | "failed" | undefined (delivered). */
    sendStatus?: "pending" | "failed";
    /** Local id for optimistic reconciliation. */
    localId?: string;
    /** Stored failure reason for failed sends. */
    failedReason?: string;
}

function eventId(): string {
    return Math.random().toString(36).slice(2);
}

function reduceEvent(prev: FeedItem[], ev: ChatEvent): FeedItem[] {
    switch (ev.kind) {
        case "user.message": {
            // Try to reconcile with an optimistic pending bubble. Match by
            // identical content + client-internal source absence.
            const idx = prev.findIndex(
                (it) => it.kind === "user"
                    && it.sendStatus === "pending"
                    && it.text === ev.content,
            );
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = {
                    ...next[idx],
                    sendStatus: undefined,
                    source: ev.source ?? null,
                    timestamp: ev.timestamp,
                };
                return next;
            }
            return capBuffer([
                ...prev,
                {
                    id: eventId(),
                    kind: "user",
                    text: ev.content,
                    source: ev.source ?? null,
                    timestamp: ev.timestamp,
                },
            ]);
        }
        case "assistant.message": {
            // Replace any partial / accumulator with same messageId; otherwise append.
            // Mark complete so late deltas can't mutate it.
            if (ev.messageId) {
                const matchId = `am-${ev.messageId}`;
                const idx = prev.findIndex((it) => it.kind === "assistant" && it.id === matchId);
                if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = {
                        ...next[idx],
                        text: ev.content ?? "",
                        html: ev.html ?? "",
                        timestamp: ev.timestamp,
                        complete: true,
                    };
                    return next;
                }
                return capBuffer([
                    ...prev,
                    {
                        id: matchId,
                        kind: "assistant",
                        text: ev.content ?? "",
                        html: ev.html ?? "",
                        timestamp: ev.timestamp,
                        complete: true,
                    },
                ]);
            }
            return capBuffer([
                ...prev,
                {
                    id: eventId(),
                    kind: "assistant",
                    text: ev.content ?? "",
                    html: ev.html ?? "",
                    timestamp: ev.timestamp,
                    complete: true,
                },
            ]);
        }
        case "assistant.message_delta": {
            if (!ev.messageId || !ev.delta) return prev;
            const matchId = `am-${ev.messageId}`;
            const idx = prev.findIndex((it) => it.kind === "assistant" && it.id === matchId);
            if (idx >= 0) {
                const cur = prev[idx];
                // Late delta after full message landed — ignore.
                if (cur.complete) return prev;
                const newText = (cur.text ?? "") + ev.delta;
                const next = [...prev];
                next[idx] = { ...cur, text: newText, html: undefined };
                return next;
            }
            return capBuffer([
                ...prev,
                {
                    id: matchId,
                    kind: "assistant",
                    text: ev.delta,
                    timestamp: ev.timestamp,
                },
            ]);
        }
        case "tool.start":
            return capBuffer([
                ...prev,
                {
                    id: `tc-${ev.toolCallId}`,
                    kind: "tool",
                    toolName: ev.toolName,
                    toolCallId: ev.toolCallId,
                    icon: ev.icon ?? "•",
                    argsSummary: ev.argsSummary,
                    status: "running",
                    timestamp: ev.timestamp,
                },
            ]);
        case "tool.complete":
            return prev.map((it) =>
                it.kind === "tool" && it.toolCallId === ev.toolCallId
                    ? {
                        ...it,
                        status: ev.success ? "ok" : "error",
                        argsSummary: ev.errorMessage
                            ? `${it.argsSummary ?? ""} · ${ev.errorMessage}`
                            : it.argsSummary,
                    }
                    : it
            );
        case "elicitation.expired":
            return prev.map((it) =>
                it.kind === "elicitation"
                    && it.elicitation
                    && it.elicitation.id === ev.elicitationId
                    ? { ...it, status: "error", failedReason: ev.reason ?? "expired" }
                    : it
            );
        default:
            return prev;
    }
}

// Cap the buffer but never evict an open elicitation card or a feed-leading
// "complete" assistant header that the user is currently scrolled to.
function capBuffer(items: FeedItem[]): FeedItem[] {
    if (items.length <= BUFFER_FEED_CAP) return items;
    const overflow = items.length - BUFFER_FEED_CAP;
    let dropped = 0;
    const out: FeedItem[] = [];
    for (const it of items) {
        if (dropped < overflow) {
            // Keep open elicitation forms regardless of age.
            if (
                it.kind === "elicitation"
                && it.elicitation
                && it.status !== "error"
                && !it.status
            ) {
                out.push(it);
                continue;
            }
            dropped++;
            continue;
        }
        out.push(it);
    }
    return out;
}

export function ChatPanel({ connected, width, adventureKey, transcriptSeed }: Props) {
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const draftKey = adventureKey ? DRAFT_KEY_PREFIX + adventureKey : null;
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [verbose, setVerbose] = useState<boolean>(() => {
        try { return localStorage.getItem(VERBOSE_KEY) === "1"; } catch (e) { warnLocalStorageFailure("read", e); return false; }
    });
    const [thinkingDepth, setThinkingDepth] = useState(0);
    const [stickyBottom, setStickyBottom] = useState(true);
    const [unread, setUnread] = useState(0);
    const feedRef = useRef<HTMLDivElement | null>(null);
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    const stickyRef = useRef(true);
    stickyRef.current = stickyBottom;

    useEffect(() => {
        try { localStorage.setItem(VERBOSE_KEY, verbose ? "1" : "0"); } catch (e) { warnLocalStorageFailure("write", e); }
    }, [verbose]);

    // ---- draft persistence per adventure
    useEffect(() => {
        if (!draftKey) {
            setDraft("");
            return;
        }
        try {
            const stored = localStorage.getItem(draftKey);
            setDraft(stored ?? "");
        } catch (e) {
            warnLocalStorageFailure("read", e);
            setDraft("");
        }
    }, [draftKey]);
    useEffect(() => {
        if (!draftKey) return;
        const handle = setTimeout(() => {
            try {
                if (draft) localStorage.setItem(draftKey, draft);
                else localStorage.removeItem(draftKey);
            } catch (e) { warnLocalStorageFailure("write", e); }
        }, 250);
        return () => clearTimeout(handle);
    }, [draft, draftKey]);

    // ---- transcript seeding when adventure changes
    useEffect(() => {
        if (!transcriptSeed) {
            setFeed([]);
            return;
        }
        let next: FeedItem[] = [];
        for (const ev of transcriptSeed) next = reduceEvent(next, ev);
        setFeed(next);
        // Force scroll-to-bottom after reseed; the user is opening the
        // adventure fresh and expects to be at the latest turn.
        setStickyBottom(true);
        setUnread(0);
    }, [transcriptSeed]);

    // ---- subscribe to live chat events
    useEffect(() => {
        const unsub = subscribeEvents((ev: ChatEvent) => {
            if (ev.kind === "thinking.start") {
                setThinkingDepth((d) => d + 1);
                return;
            }
            if (ev.kind === "thinking.end") {
                setThinkingDepth((d) => Math.max(0, d - 1));
                return;
            }
            setFeed((prev) => reduceEvent(prev, ev));
            // Bump unread counter only if the user is scrolled away and
            // the event is something they'd actually want to see.
            if (!stickyRef.current && isUnreadWorthy(ev)) {
                setUnread((n) => n + 1);
            }
        });
        return unsub;
    }, []);

    // Subscribe to elicitation requests.
    useEffect(() => {
        const unsub = subscribeElicitations((req: ElicitationRequest) => {
            setFeed((prev) => capBuffer([
                ...prev,
                { id: `el-${req.id}`, kind: "elicitation", elicitation: req },
            ]));
        });
        return unsub;
    }, []);

    // ---- track sticky-bottom from scroll events (not from layout effects)
    useEffect(() => {
        const el = feedRef.current;
        if (!el) return;
        const onScroll = () => {
            const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
            const sticky = distance < STICKY_THRESHOLD;
            setStickyBottom(sticky);
            if (sticky) setUnread(0);
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    // After feed updates, if sticky, scroll to bottom.
    useLayoutEffect(() => {
        const el = feedRef.current;
        if (!el) return;
        if (stickyRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [feed]);

    const jumpToBottom = () => {
        const el = feedRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        setStickyBottom(true);
        setUnread(0);
    };

    const send = async (overrideText?: string) => {
        const text = (overrideText ?? draft).trim();
        if (!text || !connected) return;
        const localId = eventId();
        // Optimistic pending bubble — user sees their message immediately.
        setFeed((prev) => capBuffer([
            ...prev,
            {
                id: `pending-${localId}`,
                kind: "user",
                text,
                sendStatus: "pending",
                localId,
            },
        ]));
        if (overrideText === undefined) {
            // Clear draft after optimistic append; the local state reflects
            // the message in the feed now.
            setDraft("");
        }
        setStickyBottom(true);
        setError(null);
        try {
            await api.sendChat(text);
            taRef.current?.focus();
            // The reflected user.message event will reconcile pending → delivered.
        } catch (e) {
            const reason = (e as Error).message;
            setFeed((prev) => prev.map((it) =>
                it.localId === localId
                    ? { ...it, sendStatus: "failed", failedReason: reason }
                    : it
            ));
        }
    };

    const retryFailed = (item: FeedItem) => {
        if (!item.text) return;
        // Remove the failed bubble; send() will re-append a pending one.
        setFeed((prev) => prev.filter((it) => it.localId !== item.localId));
        send(item.text);
    };

    const dismissFailed = (item: FeedItem) => {
        setFeed((prev) => prev.filter((it) => it.localId !== item.localId));
        // Restore the text into the draft so the player can edit and retry.
        if (!draft.trim() && item.text) setDraft(item.text);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // IME composition guard: don't send while user is composing CJK input.
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
            // Allow Cmd+Enter / Ctrl+Enter as backup send too.
            e.preventDefault();
            send();
        }
    };

    // Auto-grow textarea (cap ~12 lines).
    useLayoutEffect(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        const max = 12 * 22;
        ta.style.height = Math.min(ta.scrollHeight, max) + "px";
    }, [draft]);

    // Filter visible items: tool entries hidden in normal mode (except dice
    // rolls, which are immersive); skill-injected user messages hidden in
    // normal mode; cap visible count separately from the underlying buffer.
    const visibleFeed = useMemo(() => {
        const filtered = verbose
            ? feed
            : feed.filter((it) => {
                if (it.kind === "tool") {
                    // Show dice rolls in normal mode for game feel.
                    return it.icon === "🎲";
                }
                if (it.kind === "user" && it.source) return false;
                return true;
            });
        if (filtered.length <= VISIBLE_FEED_CAP) return filtered;
        return filtered.slice(filtered.length - VISIBLE_FEED_CAP);
    }, [feed, verbose]);

    return (
        <div className="chat-panel" style={{ width }}>
            <div className="chat-header">
                <span className="chat-title">⛁ Referee</span>
                <div className="chat-header-right">
                    <label className="chat-verbose" title="Show internal tool calls and skill-injected context">
                        <input
                            type="checkbox"
                            checked={verbose}
                            onChange={(e) => setVerbose(e.target.checked)}
                            aria-label="Toggle verbose mode"
                        />
                        <span>Verbose</span>
                    </label>
                    <span className="muted" style={{ fontSize: "0.7rem", letterSpacing: "0.1em" }}>
                        {connected ? "live" : "offline"}
                    </span>
                </div>
            </div>
            <div
                className="chat-feed"
                ref={feedRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
            >
                {visibleFeed.length === 0 ? (
                    <div className="chat-empty">
                        Type a message below to talk to the referee.
                        Use <kbd>Enter</kbd> to send, <kbd>Shift+Enter</kbd> for a new line.
                    </div>
                ) : visibleFeed.map((it) => (
                    <FeedItemView
                        key={it.id}
                        item={it}
                        onRetry={() => retryFailed(it)}
                        onDismiss={() => dismissFailed(it)}
                    />
                ))}
            </div>
            {!stickyBottom && unread > 0 && (
                <button className="chat-jump-button" onClick={jumpToBottom}>
                    ↓ {unread} new message{unread === 1 ? "" : "s"}
                </button>
            )}
            {error && (
                <div className="chat-error">
                    {error}{" "}
                    <button className="ghost" onClick={() => setError(null)}>dismiss</button>
                </div>
            )}
            {thinkingDepth > 0 && (
                <div className="chat-thinking-bar" role="status" aria-live="polite">
                    <span className="chat-thinking">
                        <span className="dot1" /><span className="dot2" /><span className="dot3" />
                        <span className="thinking-label">Referee is thinking</span>
                    </span>
                </div>
            )}
            <div className="chat-input">
                <textarea
                    ref={taRef}
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={connected ? "What is thy command?" : "Disconnected — reopen the OSR Game Client"}
                    disabled={!connected}
                    aria-label="Message the referee"
                />
                <button
                    className="primary"
                    onClick={() => send()}
                    disabled={!draft.trim() || !connected}
                    aria-label="Send message"
                >
                    Send
                </button>
            </div>
        </div>
    );
}

function isUnreadWorthy(ev: ChatEvent): boolean {
    return ev.kind === "assistant.message"
        || ev.kind === "assistant.message_delta"
        || ev.kind === "user.message"
        || ev.kind === "elicitation.expired";
}

function FeedItemView({ item, onRetry, onDismiss }: { item: FeedItem; onRetry: () => void; onDismiss: () => void }) {
    if (item.kind === "user") {
        return (
            <div className={`msg msg-user ${item.sendStatus ?? ""}`}>
                <div className="msg-bubble">{item.text}</div>
                {item.sendStatus === "pending" && (
                    <span className="msg-status muted" aria-label="Sending">sending…</span>
                )}
                {item.sendStatus === "failed" && (
                    <span className="msg-status failed">
                        ⚠ Failed: {item.failedReason ?? "unknown"}
                        <button className="ghost" onClick={onRetry}>Retry</button>
                        <button className="ghost" onClick={onDismiss}>Dismiss</button>
                    </span>
                )}
            </div>
        );
    }
    if (item.kind === "assistant") {
        if (!item.html && !item.text) return null;
        return (
            <div className="msg msg-assistant">
                {item.html ? (
                    <CodeBlockEnhancer html={item.html} />
                ) : (
                    <div className="msg-content"><pre className="msg-pre">{item.text}</pre></div>
                )}
            </div>
        );
    }
    if (item.kind === "tool") {
        const status = item.status ?? "running";
        return (
            <div className={`msg msg-tool tool-${status}`}>
                <span className="tool-icon">{item.icon ?? "•"}</span>
                <span className="tool-name">{item.toolName ?? ""}</span>
                {item.argsSummary && (
                    <span className="tool-args">{item.argsSummary}</span>
                )}
                {status === "running" && <span className="tool-status">…</span>}
                {status === "ok" && <span className="tool-status ok">✓</span>}
                {status === "error" && <span className="tool-status err">✗</span>}
            </div>
        );
    }
    if (item.kind === "elicitation" && item.elicitation) {
        const expired = item.status === "error" && item.failedReason === "timeout";
        return <ElicitationCard request={item.elicitation} forcedExpired={expired} />;
    }
    return <div className="msg msg-system">{item.text}</div>;
}

// Renders sanitized HTML and adds a "Copy" button to each code block. We
// can't add buttons inside the HTML string itself (server-side render
// strips raw HTML), so we mount a wrapper and decorate after render.
function CodeBlockEnhancer({ html }: { html: string }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const blocks = el.querySelectorAll("pre");
        blocks.forEach((pre) => {
            if ((pre as HTMLElement).dataset.enhanced === "1") return;
            (pre as HTMLElement).dataset.enhanced = "1";
            const btn = document.createElement("button");
            btn.className = "copy-code";
            btn.textContent = "Copy";
            btn.setAttribute("aria-label", "Copy code to clipboard");
            btn.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                try {
                    const text = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
                    await navigator.clipboard.writeText(text);
                    btn.textContent = "Copied!";
                    setTimeout(() => { btn.textContent = "Copy"; }, 1200);
                } catch {
                    btn.textContent = "Copy failed";
                }
            });
            pre.style.position = "relative";
            pre.appendChild(btn);
        });
    }, [html]);
    return (
        <div className="msg-content md" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
    );
}

// Inline elicitation form. Maps the ElicitationSchema property types to
// HTML form controls. Submit calls copilot.respondElicitation(id, result).
function ElicitationCard({ request, forcedExpired }: { request: ElicitationRequest; forcedExpired?: boolean }) {
    const [values, setValues] = useState<Record<string, ElicitationFieldValue>>(
        () => initialValues(request.requestedSchema),
    );
    const [phase, setPhase] = useState<"open" | "submitting" | "done" | "declined" | "expired">(
        forcedExpired ? "expired" : "open",
    );
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (forcedExpired && phase === "open") setPhase("expired");
    }, [forcedExpired, phase]);

    const validate = (): Record<string, string> => {
        const errs: Record<string, string> = {};
        const schema = request.requestedSchema;
        if (!schema) return errs;
        const required = new Set(schema.required ?? []);
        for (const [key, field] of Object.entries(schema.properties)) {
            const value = values[key];
            if (required.has(key)) {
                if (value === undefined || value === "" ||
                    (Array.isArray(value) && value.length === 0)) {
                    errs[key] = "Required";
                    continue;
                }
            }
            if (field.type === "array") {
                const arr = Array.isArray(value) ? value : [];
                if (field.minItems && arr.length < field.minItems) {
                    errs[key] = `Pick at least ${field.minItems}.`;
                }
                if (field.maxItems && arr.length > field.maxItems) {
                    errs[key] = `Pick at most ${field.maxItems}.`;
                }
            }
            if ((field.type === "number" || field.type === "integer") && typeof value === "number") {
                if (field.minimum !== undefined && value < field.minimum) {
                    errs[key] = `Min ${field.minimum}.`;
                }
                if (field.maximum !== undefined && value > field.maximum) {
                    errs[key] = `Max ${field.maximum}.`;
                }
            }
            if (field.type === "string" && typeof value === "string") {
                if (field.minLength && value.length < field.minLength) {
                    errs[key] = `Min ${field.minLength} chars.`;
                }
                if (field.maxLength && value.length > field.maxLength) {
                    errs[key] = `Max ${field.maxLength} chars.`;
                }
            }
        }
        return errs;
    };

    const submit = async (action: "accept" | "decline" | "cancel") => {
        if (action === "accept") {
            const errs = validate();
            if (Object.keys(errs).length > 0) {
                setFieldErrors(errs);
                return;
            }
        }
        setPhase("submitting");
        setError(null);
        try {
            const result: ElicitationResult = action === "accept"
                ? { action: "accept", content: values }
                : { action };
            await api.respondElicitation(request.id, result);
            setPhase(action === "accept" ? "done" : "declined");
        } catch (e) {
            setError((e as Error).message);
            setPhase("open");
        }
    };

    return (
        <div className={`msg msg-elicit elicit-${phase}`}>
            <div className="elicit-header">
                <span className="elicit-icon">❓</span>
                <span className="elicit-message">{request.message}</span>
            </div>
            {phase === "open" && request.requestedSchema && (
                <div className="elicit-form">
                    {Object.entries(request.requestedSchema.properties).map(([key, schema]) => (
                        <ElicitationField
                            key={key}
                            name={key}
                            schema={schema}
                            value={values[key]}
                            error={fieldErrors[key]}
                            onChange={(v) => {
                                setValues((cur) => ({ ...cur, [key]: v }));
                                if (fieldErrors[key]) {
                                    setFieldErrors((f) => {
                                        const next = { ...f };
                                        delete next[key];
                                        return next;
                                    });
                                }
                            }}
                        />
                    ))}
                </div>
            )}
            {phase === "open" && !request.requestedSchema && (
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                    No form fields provided.
                </div>
            )}
            {error && <div className="warning">{error}</div>}
            {phase === "open" && (
                <div className="elicit-actions">
                    <button className="ghost" onClick={() => submit("decline")}>Decline</button>
                    <button className="ghost" onClick={() => submit("cancel")}>Cancel</button>
                    <button className="primary" onClick={() => submit("accept")}>Submit</button>
                </div>
            )}
            {phase === "submitting" && (
                <div className="muted" style={{ fontSize: "0.85rem" }}>Submitting…</div>
            )}
            {phase === "done" && (
                <div className="muted" style={{ fontSize: "0.8rem" }}>✓ Answer sent.</div>
            )}
            {phase === "declined" && (
                <div className="muted" style={{ fontSize: "0.8rem" }}>↩ Declined.</div>
            )}
            {phase === "expired" && (
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                    ⏱ This question expired. The referee moved on.
                </div>
            )}
        </div>
    );
}

function initialValues(schema: ElicitationSchema | null): Record<string, ElicitationFieldValue> {
    if (!schema) return {};
    const out: Record<string, ElicitationFieldValue> = {};
    for (const [key, field] of Object.entries(schema.properties)) {
        if (field.default !== undefined) {
            out[key] = field.default;
        } else if (field.type === "boolean") {
            out[key] = false;
        } else if (field.type === "array") {
            out[key] = [];
        } else {
            // string / enum / oneOf / number / integer — leave empty so the
            // user has to actively pick. We deliberately do NOT default
            // numbers to 0 (which the duck flagged as a bad assumption).
            out[key] = "";
        }
    }
    return out;
}

function ElicitationField({
    name,
    schema,
    value,
    error,
    onChange,
}: {
    name: string;
    schema: import("../api").ElicitationFieldSchema;
    value: ElicitationFieldValue | undefined;
    error?: string;
    onChange: (v: ElicitationFieldValue) => void;
}) {
    const label = schema.title || name;
    return (
        <div className={`elicit-field ${error ? "has-error" : ""}`}>
            <label className="elicit-label">
                {label}
                {schema.description && (
                    <span className="muted" style={{ display: "block", fontSize: "0.7rem", textTransform: "none", letterSpacing: "0", fontWeight: 400 }}>
                        {schema.description}
                    </span>
                )}
            </label>
            {renderControl(schema, value, onChange)}
            {error && <div className="elicit-error">{error}</div>}
        </div>
    );
}

function renderControl(
    schema: import("../api").ElicitationFieldSchema,
    value: ElicitationFieldValue | undefined,
    onChange: (v: ElicitationFieldValue) => void,
): JSX.Element {
    if (schema.type === "boolean") {
        return (
            <label className="elicit-check">
                <input
                    type="checkbox"
                    checked={!!value}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <span style={{ marginLeft: "0.4rem" }}>{schema.title ?? ""}</span>
            </label>
        );
    }
    if (schema.type === "number" || schema.type === "integer") {
        return (
            <input
                type="number"
                value={value === "" || value === undefined ? "" : (value as number)}
                min={schema.minimum}
                max={schema.maximum}
                step={schema.type === "integer" ? 1 : "any"}
                onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            />
        );
    }
    if (schema.type === "array") {
        // multi-select via checkboxes from items.enum or items.anyOf
        const opts = optionsFromArrayItems(schema.items);
        const selected = Array.isArray(value) ? (value as string[]) : [];
        const toggle = (v: string) => {
            const next = selected.includes(v)
                ? selected.filter((x) => x !== v)
                : [...selected, v];
            onChange(next);
        };
        return (
            <div className="elicit-multi">
                {opts.length === 0 ? (
                    <span className="muted">No options available.</span>
                ) : opts.map((o) => (
                    <label key={o.value} className="elicit-check">
                        <input
                            type="checkbox"
                            checked={selected.includes(o.value)}
                            onChange={() => toggle(o.value)}
                        />
                        <span style={{ marginLeft: "0.4rem" }}>{o.label}</span>
                    </label>
                ))}
            </div>
        );
    }
    // string-ish — enum, oneOf, or freeform
    if (schema.enum && schema.enum.length > 0) {
        const labels = schema.enumNames ?? schema.enum;
        return (
            <select value={value as string ?? ""} onChange={(e) => onChange(e.target.value)}>
                <option value="">— pick one —</option>
                {schema.enum.map((v, i) => (
                    <option key={v} value={v}>{labels[i] ?? v}</option>
                ))}
            </select>
        );
    }
    if (schema.oneOf && schema.oneOf.length > 0) {
        return (
            <select value={value as string ?? ""} onChange={(e) => onChange(e.target.value)}>
                <option value="">— pick one —</option>
                {schema.oneOf.map((o) => (
                    <option key={o.const} value={o.const}>{o.title}</option>
                ))}
            </select>
        );
    }
    return (
        <input
            type={schema.format === "email" ? "email" : schema.format === "date" ? "date" : "text"}
            value={value as string ?? ""}
            minLength={schema.minLength}
            maxLength={schema.maxLength}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

function optionsFromArrayItems(
    items: import("../api").ElicitationFieldSchema["items"],
): { value: string; label: string }[] {
    if (!items) return [];
    if ("enum" in items && items.enum) {
        return items.enum.map((v) => ({ value: v, label: v }));
    }
    if ("anyOf" in items && items.anyOf) {
        return items.anyOf.map((o) => ({ value: o.const, label: o.title }));
    }
    return [];
}
