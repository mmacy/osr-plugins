import { createRoot } from "react-dom/client";
import { App } from "./App";
import { publishElicitation, publishEvent } from "./chatBus";
import type { ChatEvent, ElicitationRequest } from "./api";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");

const root = createRoot(rootEl);
root.render(<App />);

// Expose imperative handles the extension can drive via
// `osr_game_client_eval`. The chat-event bridge is the primary one;
// `refresh` and `ping` remain for ad-hoc agent-initiated actions.
declare global {
    interface Window {
        osrGameClient: {
            refresh: () => void;
            ping: () => string;
            event: (payload: ChatEvent) => void;
            elicitation: (req: ElicitationRequest) => void;
        };
    }
}

window.osrGameClient = {
    refresh: () => {
        window.location.reload();
    },
    ping: () => "ok",
    event: (payload) => {
        publishEvent(payload);
    },
    elicitation: (req) => {
        publishElicitation(req);
    },
};
