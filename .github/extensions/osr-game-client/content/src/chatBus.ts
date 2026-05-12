// Tiny event bus for chat events pushed from the extension via
// `window.osrGameClient.event(...)`. Components subscribe via `useChatEvents`;
// the App wires the global window hook in main.tsx.

import type { ChatEvent, ElicitationRequest } from "./api";

type EventListener = (e: ChatEvent) => void;
type ElicitationListener = (req: ElicitationRequest) => void;

let eventListeners: EventListener[] = [];
let elicitationListeners: ElicitationListener[] = [];

export function publishEvent(event: ChatEvent): void {
    for (const l of eventListeners) {
        try { l(event); } catch { /* ignore listener errors */ }
    }
}

export function publishElicitation(req: ElicitationRequest): void {
    for (const l of elicitationListeners) {
        try { l(req); } catch { /* ignore listener errors */ }
    }
}

export function subscribeEvents(l: EventListener): () => void {
    eventListeners.push(l);
    return () => {
        eventListeners = eventListeners.filter((x) => x !== l);
    };
}

export function subscribeElicitations(l: ElicitationListener): () => void {
    elicitationListeners.push(l);
    return () => {
        elicitationListeners = elicitationListeners.filter((x) => x !== l);
    };
}
