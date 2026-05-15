// Child process: opens the native window. The Node event loop is blocked
// by app.run() — all communication happens via the page's WebSocket.
import { Application } from "@webviewjs/webview";

const { CW_TITLE, CW_WIDTH, CW_HEIGHT } = process.env;
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const url = Buffer.concat(chunks).toString("utf8").trim();
if (!url) throw new Error("missing webview URL");

const app = new Application();
const win = app.createBrowserWindow({ title: CW_TITLE, width: +CW_WIDTH, height: +CW_HEIGHT });
win.createWebview({ url, enableDevtools: true });
app.run();
