// osr-game-client: a live game client for the bx-referee (Old-School
// Essentials) plugin. The page is read-mostly: it never writes PARTY.md,
// SESSION.md, or LOCATIONS.md. All writes go to a hidden sidecar
// directory `<adventure>/.osr-game-client/` so the bx-referee plugin
// retains full ownership of its canonical files.

import { joinSession } from "@github/copilot-sdk/extension";
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import {
    mkdir,
    readFile,
    readdir,
    rename,
    stat,
    writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { marked } from "marked";
import { CopilotWebview } from "./lib/copilot-webview.js";

marked.setOptions({ gfm: true, breaks: false });

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function safeMarkdownUrl(href) {
    if (typeof href !== "string") return null;
    const raw = href.trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return null;
    let parsed;
    try {
        parsed = new URL(raw, "https://osr-game-client.local/");
    } catch {
        return null;
    }
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
    const isRelative = parsed.origin === "https://osr-game-client.local" && !hasScheme;
    if (isRelative) {
        try {
            return encodeURI(raw).replace(/%25/g, "%");
        } catch {
            return null;
        }
    }
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) return parsed.href;
    return null;
}

function renderMarkdown(content) {
    try {
        return marked.parse(content, { async: false });
    } catch (e) {
        console.error("[osr-game-client] markdown render failed", e);
        return "";
    }
}

// Disable raw HTML and filter markdown link/image URLs. SRD content is local
// and trusted, but defense-in-depth: the page has access to `window.copilot`,
// so any injection inside a `dangerouslySetInnerHTML` block could in principle
// drive callbacks that touch the filesystem.
marked.use({
    renderer: {
        html() { return ""; },
        link({ href, title, tokens }) {
            const text = this.parser.parseInline(tokens);
            const safeHref = safeMarkdownUrl(href);
            if (safeHref == null) return text;
            let out = `<a href="${escapeHtml(safeHref)}"`;
            if (title) out += ` title="${escapeHtml(title)}"`;
            out += `>${text}</a>`;
            return out;
        },
        image({ href, title, text }) {
            const safeHref = safeMarkdownUrl(href);
            if (safeHref == null) return escapeHtml(text);
            let out = `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"`;
            if (title) out += ` title="${escapeHtml(title)}"`;
            out += ">";
            return out;
        },
    },
});

const EXT_DIR = import.meta.dirname;
const STATE_DIR = EXT_DIR;
const LAST_GAME_ROOT_FILE = join(STATE_DIR, ".last-game-root");
const PLUGIN_ROOT_FILE = join(STATE_DIR, ".plugin-root");

const SIDECAR_DIR = ".osr-game-client";
const COMBAT_FILE = "combat.json";
const VISITED_FILE = "visited.json";
const NOTES_FILE = "notes.md";
const SCHEMA_VERSION = 1;

const PLUGIN_ROOT_CANDIDATES = [
    join(homedir(), ".copilot/installed-plugins/_direct/bx-referee"),
];

// ---------- path safety ----------

function expandHome(p) {
    if (typeof p !== "string") return p;
    if (p === "~") return homedir();
    if (p.startsWith("~/")) return join(homedir(), p.slice(2));
    return p;
}

function ensureAbsolute(p, label) {
    if (typeof p !== "string" || !p.length) {
        throw new Error(`${label} must be a non-empty string`);
    }
    const expanded = expandHome(p);
    if (!isAbsolute(expanded)) {
        throw new Error(`${label} must be an absolute path: ${p}`);
    }
    return resolve(expanded);
}

function assertSubpath(child, parent, label) {
    const c = resolve(child);
    const p = resolve(parent);
    if (c !== p && !c.startsWith(p + sep)) {
        throw new Error(`${label} escapes its root: ${child}`);
    }
    return c;
}

function validAdventureName(name) {
    return typeof name === "string"
        && name.length < 200
        && /^[a-z0-9][a-z0-9-]*$/.test(name);
}

async function adventureDir(gameRoot, name) {
    if (!validAdventureName(name)) {
        throw new Error(`invalid adventure name: ${name}`);
    }
    const root = ensureAbsolute(gameRoot, "gameRoot");
    const dir = resolve(root, "adventures", name);
    assertSubpath(dir, root, "adventure directory");
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        throw new Error(`adventure directory does not exist: ${dir}`);
    }
    return dir;
}

async function sidecarDir(gameRoot, name) {
    const adv = await adventureDir(gameRoot, name);
    const dir = join(adv, SIDECAR_DIR);
    await mkdir(dir, { recursive: true });
    return dir;
}

// ---------- atomic writes + per-file locks ----------

// Per-file async serialization. setLocationVisited / appendNote / saveCombatState
// all do read-modify-write on a sidecar JSON; without a lock, two overlapping
// calls can read the same old file and the second rename clobbers the first.
const fileLocks = new Map();

async function withFileLock(filePath, fn) {
    const prev = fileLocks.get(filePath) ?? Promise.resolve();
    let release;
    const next = new Promise((r) => { release = r; });
    const chained = prev.then(() => next);
    fileLocks.set(filePath, chained);
    try {
        await prev;
        return await fn();
    } finally {
        release();
        // Garbage-collect the lock if no follower queued behind us.
        if (fileLocks.get(filePath) === chained) {
            fileLocks.delete(filePath);
        }
    }
}

async function atomicWrite(filePath, contents) {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`;
    await writeFile(tmp, contents, "utf8");
    await rename(tmp, filePath);
}

class CorruptJsonError extends Error {
    constructor(file, cause) {
        super(`corrupt JSON in ${file}: ${cause.message}`);
        this.name = "CorruptJsonError";
        this.cause = cause;
    }
}

async function readJsonOrNull(filePath) {
    let text;
    try {
        text = await readFile(filePath, "utf8");
    } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
    }
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new CorruptJsonError(filePath, e);
    }
}

// Best-effort sidecar JSON read: ENOENT → null, but corrupt JSON is logged
// (visible in webview-child stderr) and treated as null so the UI stays
// responsive. We deliberately do not throw here because callers that
// load the snapshot would otherwise crash the whole tab.
async function readJsonOrNullSafe(filePath) {
    try {
        return await readJsonOrNull(filePath);
    } catch (e) {
        if (e instanceof CorruptJsonError) {
            process.stderr.write(`[osr-game-client] ${e.message}\n`);
            return null;
        }
        throw e;
    }
}

async function readTextOrNull(filePath) {
    try {
        return await readFile(filePath, "utf8");
    } catch (e) {
        if (e?.code === "ENOENT") return null;
        process.stderr.write(`[osr-game-client] failed to read ${filePath}: ${e.message}\n`);
        return null;
    }
}

async function mtimeOrNull(filePath) {
    try {
        return (await stat(filePath)).mtimeMs;
    } catch (e) {
        if (e?.code === "ENOENT") return null;
        process.stderr.write(`[osr-game-client] failed to stat ${filePath}: ${e.message}\n`);
        return null;
    }
}

// ---------- plugin root discovery ----------

async function detectPluginRoot() {
    const explicit = await readTextOrNull(PLUGIN_ROOT_FILE);
    if (explicit) {
        const trimmed = explicit.trim();
        if (await isValidPluginRoot(trimmed)) return trimmed;
    }
    for (const candidate of PLUGIN_ROOT_CANDIDATES) {
        if (await isValidPluginRoot(candidate)) return candidate;
    }
    return null;
}

async function isValidPluginRoot(p) {
    if (!p) return false;
    try {
        const abs = ensureAbsolute(p, "pluginRoot");
        return existsSync(join(abs, "skills/referee/scripts/roll.py"))
            && existsSync(join(abs, "skills/referee/references/srd_map.md"));
    } catch {
        return false;
    }
}

// ---------- Markdown parsers (tolerant for display, conservative on writes) ----------

// PARTY.md format example:
//   - BLARG | Fighter | Level 1 | Neutral | He/Him
//     - STR 14 (+1) | INT 10 | WIS 11 | DEX 14 (+1) | CON 15 (+1) | CHA 11
//     - AC 1 [18] | HP 7/7 | THAC0 19 [0] | XP 0/2,000 (+5%)
//     - SAVES: Death 12 | Wands 13 | Paralysis 14 | Breath 15 | Spells 16
//     - EQUIPMENT: ...
//     - MONEY: ...
//     - ENC 670/1,600 cn | MV 90'(30')
//     - LANGUAGES: ...
function parseParty(text) {
    if (!text) return { characters: [], warnings: ["empty PARTY.md"] };
    const lines = text.split(/\r?\n/);
    const blocks = [];
    let current = null;
    for (const raw of lines) {
        const line = raw.trimEnd();
        const top = /^- ([^|]+?)\s*\|\s*(.+)$/.exec(line);
        if (top && !line.startsWith("  ")) {
            if (current) blocks.push(current);
            current = { firstLine: line, body: [] };
        } else if (current && /^\s+- /.test(line)) {
            current.body.push(line.replace(/^\s+- /, ""));
        } else if (current && line.trim() === "") {
            blocks.push(current);
            current = null;
        }
    }
    if (current) blocks.push(current);

    const characters = [];
    const warnings = [];
    for (const block of blocks) {
        try {
            characters.push(parseCharacter(block));
        } catch (e) {
            warnings.push(`could not parse character block: ${e.message}`);
            characters.push({
                name: "(unparseable)",
                raw: [block.firstLine, ...block.body].join("\n"),
                parseError: e.message,
            });
        }
    }
    return { characters, warnings };
}

function parseCharacter(block) {
    const headerMatch = /^- ([^|]+?)\s*\|\s*(.+?)(?:\s*\|\s*STATUS:\s*(\w+))?$/
        .exec(block.firstLine);
    if (!headerMatch) throw new Error(`bad header line: ${block.firstLine}`);
    const [, name, headerRest, statusRaw] = headerMatch;
    const headerParts = headerRest.split("|").map((s) => s.trim());
    const character = {
        name: name.trim(),
        classRaw: headerParts[0] || null,
        level: parsePart(headerParts, /^Level\s+(\d+)/i, 1, Number),
        alignment: headerParts[2] || null,
        pronouns: headerParts[3] || null,
        status: statusRaw ? statusRaw.toUpperCase() : "ALIVE",
        raw: [block.firstLine, ...block.body].join("\n"),
    };
    for (const body of block.body) {
        const m = /^([A-Z][A-Z _]*?):\s*(.*)$/.exec(body);
        if (m) {
            const [, key, value] = m;
            switch (key.replace(/\s+/g, "_")) {
                case "SAVES": character.saves = parseSaves(value); break;
                case "EQUIPMENT": character.equipment = value.trim(); break;
                case "MONEY": character.money = value.trim(); break;
                case "LANGUAGES": character.languages = value.trim(); break;
                case "SPELLS": character.spells = value.trim(); break;
                case "SPECIAL_ABILITIES":
                    character.specialAbilities = value.trim();
                    break;
                case "THIEF_SKILLS":
                    character.thiefSkills = value.trim();
                    break;
                case "CLERIC_TURNING":
                    character.clericTurning = value.trim();
                    break;
                default:
                    character.extra ??= {};
                    character.extra[key] = value.trim();
            }
            continue;
        }
        // Stat blocks (no leading "KEY:")
        if (/STR\s+\d/.test(body)) {
            character.abilities = parseAbilities(body);
        } else if (/AC\s+/.test(body) && /HP\s+/.test(body)) {
            character.combatStats = parseCombatStats(body);
        } else if (/^ENC\s+/.test(body)) {
            character.encumbrance = parseEnc(body);
        }
    }
    return character;
}

function parsePart(parts, re, idx, transform = (x) => x) {
    const m = re.exec(parts[idx] || "");
    if (!m) return null;
    return transform(m[1]);
}

function parseAbilities(line) {
    const out = {};
    const re = /(STR|INT|WIS|DEX|CON|CHA)\s+(\d+)\s*(?:\(([+-]?\d+)\))?/g;
    let m;
    while ((m = re.exec(line))) {
        out[m[1].toLowerCase()] = {
            score: Number(m[2]),
            mod: m[3] != null ? Number(m[3]) : 0,
        };
    }
    return out;
}

function parseCombatStats(line) {
    const acDescMatch = /AC\s+(-?\d+)(?:\s*\[(\d+)\])?/.exec(line);
    const hpMatch = /HP\s+(\d+)(?:\/(\d+))?/.exec(line);
    const thacoMatch = /THAC0\s+(\d+)(?:\s*\[([+-]?\d+)\])?/.exec(line);
    const xpMatch = /XP\s+([\d,]+)\s*\/\s*([\d,]+)(?:\s*\(([+-]?\d+%)\))?/
        .exec(line);
    return {
        ac: acDescMatch ? Number(acDescMatch[1]) : null,
        acAscending: acDescMatch && acDescMatch[2]
            ? Number(acDescMatch[2])
            : null,
        hpCurrent: hpMatch ? Number(hpMatch[1]) : null,
        hpMax: hpMatch && hpMatch[2] ? Number(hpMatch[2]) : null,
        thaco: thacoMatch ? Number(thacoMatch[1]) : null,
        thacoAttackBonus: thacoMatch && thacoMatch[2]
            ? Number(thacoMatch[2])
            : null,
        xp: xpMatch ? Number(xpMatch[1].replace(/,/g, "")) : null,
        xpNext: xpMatch ? Number(xpMatch[2].replace(/,/g, "")) : null,
        xpBonus: xpMatch && xpMatch[3] ? xpMatch[3] : null,
    };
}

function parseSaves(value) {
    const out = {};
    const re = /(Death|Wands|Paralysis|Breath|Spells)\s+(\d+)/g;
    let m;
    while ((m = re.exec(value))) {
        out[m[1].toLowerCase()] = Number(m[2]);
    }
    return out;
}

function parseEnc(line) {
    const encMatch = /ENC\s+([\d,]+)\s*\/\s*([\d,]+)\s*cn/.exec(line);
    const mvMatch = /MV\s+(\d+)'\((\d+)'\)/.exec(line);
    return {
        current: encMatch ? Number(encMatch[1].replace(/,/g, "")) : null,
        max: encMatch ? Number(encMatch[2].replace(/,/g, "")) : null,
        movePerTurn: mvMatch ? Number(mvMatch[1]) : null,
        movePerRound: mvMatch ? Number(mvMatch[2]) : null,
    };
}

function parseSession(text) {
    if (!text) return { status: {}, log: [], casualties: [], situation: "" };
    const sections = splitMarkdownSections(text);
    const status = parseSessionStatus(sections["Current status"] || "");
    const logEntries = parseSessionLogEntries(sections["Session log"] || "");
    const casualties = parseCasualties(sections["Casualties"] || "");
    const situation = (sections["Current situation"] || "").trim();
    return { status, log: logEntries, casualties, situation };
}

function splitMarkdownSections(text) {
    const out = {};
    const lines = text.split(/\r?\n/);
    let currentH2 = null;
    let buf = [];
    for (const line of lines) {
        const m = /^##\s+(.+?)\s*$/.exec(line);
        if (m) {
            if (currentH2) out[currentH2] = buf.join("\n");
            currentH2 = m[1];
            buf = [];
        } else if (currentH2) {
            buf.push(line);
        }
    }
    if (currentH2) out[currentH2] = buf.join("\n");
    return out;
}

function parseSessionStatus(text) {
    const status = {};
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const locMatch = /\*\*Location:\*\*\s+(.+)/.exec(line);
        if (locMatch) status.location = locMatch[1].trim();
        const turnMatch = /\*\*Turn:\*\*\s+([^|]+)/.exec(line);
        if (turnMatch) status.turn = turnMatch[1].trim();
        const hourMatch = /\*\*Hour:\*\*\s+(.+)/.exec(line);
        if (hourMatch) status.hour = hourMatch[1].trim();
        const lightMatch = /\*\*Light:\*\*\s+(.+)/.exec(line);
        if (lightMatch) status.light = lightMatch[1].trim();
    }
    return status;
}

function parseSessionLogEntries(text) {
    const entries = [];
    const lines = text.split(/\r?\n/);
    let current = null;
    for (const line of lines) {
        const h3 = /^###\s+(.+?)\s*$/.exec(line);
        if (h3) {
            if (current) entries.push(current);
            current = { heading: h3[1].trim(), body: [] };
        } else if (current) {
            current.body.push(line);
        }
    }
    if (current) entries.push(current);
    return entries.map((e) => ({ heading: e.heading, body: e.body.join("\n").trim() }));
}

function parseCasualties(text) {
    const out = [];
    const lines = text.split(/\r?\n/);
    let pastHeader = false;
    for (const line of lines) {
        if (/^\|\s*-+\s*\|/.test(line)) {
            pastHeader = true;
            continue;
        }
        if (!pastHeader) continue;
        const cells = line.split("|").slice(1, -1).map((s) => s.trim());
        if (cells.length >= 4 && cells[0]) {
            out.push({
                name: cells[0],
                class: cells[1],
                cause: cells[2],
                session: cells[3],
            });
        }
    }
    return out;
}

function parseLocations(text) {
    if (!text) return { modulePath: null, intro: null, sections: [] };
    const lines = text.split(/\r?\n/);
    let modulePath = null;
    let intro = null;
    const sections = [];
    let currentSection = null;
    for (const line of lines) {
        const modMatch = /^\s*-\s*\*\*Module:\*\*\s*`([^`]+)`/.exec(line);
        if (modMatch) {
            modulePath = modMatch[1];
            continue;
        }
        const introMatch = /^\s*-\s*\*\*Intro:\*\*\s*(.+)/.exec(line);
        if (introMatch) {
            intro = introMatch[1].trim();
            continue;
        }
        const h2 = /^##\s+(.+?)\s*$/.exec(line);
        if (h2) {
            currentSection = { name: h2[1].trim(), entries: [] };
            sections.push(currentSection);
            continue;
        }
        const entryMatch = /^\s*-\s+([\w\d][\w\d.\-]*?)\.?\s+(.+?)(?:\s*\(([^)]+)\))?\s*$/
            .exec(line);
        if (entryMatch && currentSection) {
            const [, id, name, ref] = entryMatch;
            currentSection.entries.push({
                id: id.replace(/\.$/, ""),
                name: name.trim(),
                ref: ref ? ref.trim() : null,
                raw: line,
            });
        }
    }
    return { modulePath, intro, sections };
}

// ---------- SRD index ----------

let srdIndexCache = null;

async function buildSrdIndex(pluginRoot) {
    if (srdIndexCache && srdIndexCache.pluginRoot === pluginRoot) {
        return srdIndexCache;
    }
    const refsDir = join(pluginRoot, "skills/referee/references");
    const srdDir = join(refsDir, "srd");
    const mapFiles = ["srd_map.md", "srd_monsters.md", "srd_spells.md"];
    const entries = [];
    const seen = new Set();
    for (const mapFile of mapFiles) {
        const text = await readTextOrNull(join(refsDir, mapFile));
        if (!text) continue;
        const re = /\[([^\]]+)\]\(srd\/([^)#]+\.md)\)/g;
        let m;
        const category = mapFile === "srd_monsters.md"
            ? "monsters"
            : mapFile === "srd_spells.md"
                ? "spells"
                : "rules";
        while ((m = re.exec(text))) {
            const [, title, file] = m;
            const key = `${title}::${file}`;
            if (seen.has(key)) continue;
            seen.add(key);
            entries.push({ title: title.trim(), file, category });
        }
    }
    srdIndexCache = { pluginRoot, srdDir, entries };
    return srdIndexCache;
}

// ---------- callbacks ----------

const callbacks = {
    async ping() {
        return { ok: true, at: Date.now() };
    },

    async getSetup() {
        const lastGameRoot = (await readTextOrNull(LAST_GAME_ROOT_FILE) || "").trim() || null;
        const pluginRoot = await detectPluginRoot();
        const pluginRootValid = await isValidPluginRoot(pluginRoot);
        const rollProbe = pluginRoot && pluginRootValid
            ? await rollOnce(pluginRoot, "1d20")
            : { ok: false, error: "no plugin root" };
        const srdProbe = pluginRoot && pluginRootValid
            ? await probeSrd(pluginRoot)
            : { ok: false, error: "no plugin root" };
        return {
            lastGameRoot,
            pluginRoot,
            pluginRootValid,
            rollProbe,
            srdProbe,
        };
    },

    async setGameRoot(path) {
        const abs = ensureAbsolute(path, "gameRoot");
        if (!existsSync(abs) || !statSync(abs).isDirectory()) {
            throw new Error(`game root does not exist: ${abs}`);
        }
        await atomicWrite(LAST_GAME_ROOT_FILE, abs);
        return { gameRoot: abs };
    },

    async setPluginRoot(path) {
        const abs = ensureAbsolute(path, "pluginRoot");
        if (!await isValidPluginRoot(abs)) {
            throw new Error(
                `not a valid bx-referee plugin root (missing roll.py or srd_map.md): ${abs}`,
            );
        }
        await atomicWrite(PLUGIN_ROOT_FILE, abs);
        srdIndexCache = null;
        return { pluginRoot: abs };
    },

    async listAdventures(gameRoot) {
        const root = ensureAbsolute(gameRoot, "gameRoot");
        const advRoot = join(root, "adventures");
        if (!existsSync(advRoot)) return { adventures: [] };
        const entries = await readdir(advRoot, { withFileTypes: true });
        const out = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (!validAdventureName(entry.name)) continue;
            const partyPath = join(advRoot, entry.name, "PARTY.md");
            const sessionPath = join(advRoot, entry.name, "SESSION.md");
            const partyMtime = await mtimeOrNull(partyPath);
            const sessionMtime = await mtimeOrNull(sessionPath);
            if (partyMtime == null && sessionMtime == null) continue;
            out.push({
                name: entry.name,
                hasParty: partyMtime != null,
                hasSession: sessionMtime != null,
                lastModified: Math.max(partyMtime ?? 0, sessionMtime ?? 0),
            });
        }
        out.sort((a, b) => b.lastModified - a.lastModified);
        return { adventures: out };
    },

    async loadAdventure(gameRoot, name) {
        const dir = await adventureDir(gameRoot, name);
        const partyPath = join(dir, "PARTY.md");
        const sessionPath = join(dir, "SESSION.md");
        const locationsPath = join(dir, "LOCATIONS.md");
        const sidecar = join(dir, SIDECAR_DIR);
        const partyText = await readTextOrNull(partyPath);
        const sessionText = await readTextOrNull(sessionPath);
        const locationsText = await readTextOrNull(locationsPath);
        const combat = await readJsonOrNullSafe(join(sidecar, COMBAT_FILE));
        const visited = await readJsonOrNullSafe(join(sidecar, VISITED_FILE));
        const notes = await readTextOrNull(join(sidecar, NOTES_FILE));
        return {
            name,
            adventureDir: dir,
            party: parseParty(partyText || ""),
            session: parseSession(sessionText || ""),
            locations: parseLocations(locationsText || ""),
            combat: combat ?? { schemaVersion: SCHEMA_VERSION, round: 1, active: -1, combatants: [] },
            visited: visited ?? { schemaVersion: SCHEMA_VERSION, marks: {} },
            notes: notes ?? "",
            mtimes: {
                party: await mtimeOrNull(partyPath),
                session: await mtimeOrNull(sessionPath),
                locations: await mtimeOrNull(locationsPath),
                combat: await mtimeOrNull(join(sidecar, COMBAT_FILE)),
                visited: await mtimeOrNull(join(sidecar, VISITED_FILE)),
                notes: await mtimeOrNull(join(sidecar, NOTES_FILE)),
            },
        };
    },

    async pollAdventure(gameRoot, name, knownMtimes = {}) {
        const dir = await adventureDir(gameRoot, name);
        const sidecar = join(dir, SIDECAR_DIR);
        const current = {
            party: await mtimeOrNull(join(dir, "PARTY.md")),
            session: await mtimeOrNull(join(dir, "SESSION.md")),
            locations: await mtimeOrNull(join(dir, "LOCATIONS.md")),
            combat: await mtimeOrNull(join(sidecar, COMBAT_FILE)),
            visited: await mtimeOrNull(join(sidecar, VISITED_FILE)),
            notes: await mtimeOrNull(join(sidecar, NOTES_FILE)),
        };
        const changed = Object.keys(current).some(
            (k) => current[k] !== (knownMtimes[k] ?? null),
        );
        if (!changed) return { changed: false };
        return { changed: true, snapshot: await callbacks.loadAdventure(gameRoot, name) };
    },

    async saveCombatState(gameRoot, name, state) {
        const dir = await sidecarDir(gameRoot, name);
        const file = join(dir, COMBAT_FILE);
        return await withFileLock(file, async () => {
            const payload = { ...state, schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString() };
            await atomicWrite(file, JSON.stringify(payload, null, 2));
            return { savedAt: payload.savedAt };
        });
    },

    async setLocationVisited(gameRoot, name, locId, status) {
        if (typeof locId !== "string" || !locId.length) {
            throw new Error("locId must be a non-empty string");
        }
        if (status != null && !["visited", "cleared"].includes(status)) {
            throw new Error(`invalid status: ${status}`);
        }
        const dir = await sidecarDir(gameRoot, name);
        const file = join(dir, VISITED_FILE);
        return await withFileLock(file, async () => {
            const current = await readJsonOrNullSafe(file)
                ?? { schemaVersion: SCHEMA_VERSION, marks: {} };
            if (!current.marks) current.marks = {};
            if (status == null) {
                delete current.marks[locId];
            } else {
                current.marks[locId] = { status, at: new Date().toISOString() };
            }
            current.schemaVersion = SCHEMA_VERSION;
            await atomicWrite(file, JSON.stringify(current, null, 2));
            return current;
        });
    },

    async appendNote(gameRoot, name, entry) {
        const text = String(entry ?? "").trim();
        if (!text) throw new Error("note is empty");
        const dir = await sidecarDir(gameRoot, name);
        const file = join(dir, NOTES_FILE);
        return await withFileLock(file, async () => {
            const existing = await readTextOrNull(file) ?? "# Player notes\n\n";
            const stamp = new Date().toISOString();
            const next = `${existing.replace(/\s+$/, "")}\n\n## ${stamp}\n\n${text}\n`;
            await atomicWrite(file, next);
            return { savedAt: stamp };
        });
    },

    async rollDice(expr) {
        const pluginRoot = await detectPluginRoot();
        if (!pluginRoot) {
            throw new Error("plugin root not configured; cannot roll");
        }
        return rollOnce(pluginRoot, expr);
    },

    async searchSrd(query) {
        const pluginRoot = await detectPluginRoot();
        if (!pluginRoot) throw new Error("plugin root not configured");
        const index = await buildSrdIndex(pluginRoot);
        const q = String(query ?? "").toLowerCase().trim();
        if (!q) return { entries: index.entries.slice(0, 50) };
        const scored = index.entries
            .map((e) => ({ entry: e, score: scoreMatch(e.title.toLowerCase(), q) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 50)
            .map((x) => x.entry);
        return { entries: scored };
    },

    async readSrd(file) {
        const pluginRoot = await detectPluginRoot();
        if (!pluginRoot) throw new Error("plugin root not configured");
        const index = await buildSrdIndex(pluginRoot);
        const known = index.entries.find((e) => e.file === file);
        if (!known) throw new Error(`unknown SRD file: ${file}`);
        const abs = resolve(index.srdDir, file);
        assertSubpath(abs, index.srdDir, "SRD file");
        const content = await readTextOrNull(abs);
        if (content == null) throw new Error(`could not read SRD file: ${file}`);
        const html = renderMarkdown(content);
        return { file, title: known.title, content, html };
    },

    async startNewAdventure(gameRoot, name, modulePath) {
        if (!sessionRef) {
            throw new Error("session not ready; please retry in a moment");
        }
        const root = ensureAbsolute(gameRoot, "gameRoot");
        if (!validAdventureName(name)) {
            throw new Error(
                `adventure name must be a slug (lowercase letters, digits, dashes; cannot start with a dot or dash): ${name}`,
            );
        }
        const moduleAbs = ensureAbsolute(modulePath, "modulePath");
        if (!existsSync(moduleAbs) || statSync(moduleAbs).isDirectory()) {
            throw new Error(`module file does not exist: ${moduleAbs}`);
        }
        const advDir = resolve(root, "adventures", name);
        if (existsSync(advDir)) {
            throw new Error(
                `adventure directory already exists: ${advDir}. Pick a different name or continue the existing adventure.`,
            );
        }
        const prompt =
            agentPromptHeader() +
            `The player wants to start a new bx-referee adventure. Invoke the ` +
            `**bx-referee:referee** orchestrator skill — its first action loads the ` +
            `constitution and routes into the right sub-skill. The game directory, ` +
            `module file, and adventure name are already chosen via the OSR Game ` +
            `Client, so skip the AskUserQuestion prompts that would ask for them and ` +
            `route straight into the adventure skill in "new" mode:\n\n` +
            promptBullet("Game root", root) +
            promptBullet("Module file", moduleAbs) +
            promptBullet("Adventure name (directory slug)", name) +
            `\nThen proceed with the rest of the standard new-adventure flow (LOCATIONS.md, ` +
            `PARTY.md, SESSION.md, party setup, scene-setting). Use AskUserQuestion as ` +
            `designed for any remaining decisions — those will render as inline forms in ` +
            `the OSR Game Client for the player.`;
        // Fire-and-forget: the agent will likely ask follow-up questions in chat
        // (party setup, etc.), so we don't await sendAndWait.
        await sessionRef.send({ prompt });
        return { ok: true, gameRoot: root, name, modulePath: moduleAbs };
    },

    async continueAdventure(gameRoot, name) {
        if (!sessionRef) {
            throw new Error("session not ready; please retry in a moment");
        }
        const root = ensureAbsolute(gameRoot, "gameRoot");
        const dir = await adventureDir(root, name);
        const sessionPath = join(dir, "SESSION.md");
        const sessionText = await readTextOrNull(sessionPath);
        const isFirstSession = !sessionText
            || !/^### Session \d+/m.test(sessionText);
        const verb = isFirstSession ? "begin" : "resume";
        const mode = isFirstSession ? "new" : "continue";
        const prompt =
            agentPromptHeader() +
            `The player has opened the OSR Game Client and wants to ${verb} play. ` +
            `Invoke the **bx-referee:referee** orchestrator skill — its first action ` +
            `loads the constitution and routes into the right sub-skill. The game ` +
            `directory and adventure name are already chosen via the OSR Game Client, ` +
            `so skip the AskUserQuestion prompts that would ask for them and route ` +
            `straight into the adventure skill in "${mode}" mode for this specific ` +
            `adventure:\n\n` +
            promptBullet("Game root", root) +
            promptBullet("Adventure", name) +
            promptBullet("Adventure directory", dir) +
            `\n` +
            (isFirstSession
                ? `This adventure has no session log yet, so this is the opening session. ` +
                  `Route to the adventure skill's scene-setting step (or call the ` +
                  `exploration skill directly if scene-setting was already done in a ` +
                  `previous turn).`
                : `Read SESSION.md and PARTY.md, give a brief player-facing recap of the ` +
                  `current location, turn, hour, light state, party HP/conditions, and the ` +
                  `last major event, then hand off to the exploration skill (or whatever ` +
                  `skill matches the current situation).`) +
            ` Use AskUserQuestion as designed.`;
        await sessionRef.send({ prompt });
        return { ok: true, gameRoot: root, name, isFirstSession };
    },

    async sendChat(prompt) {
        if (!sessionRef) {
            throw new Error("session not ready; please retry in a moment");
        }
        const text = String(prompt ?? "").trim();
        if (!text) throw new Error("chat message is empty");
        if (text.length > 32_000) throw new Error("chat message too long");
        await sessionRef.send({ prompt: text });
        return { ok: true };
    },

    async respondElicitation(id, result) {
        const entry = pendingElicitations.get(id);
        if (!entry) {
            throw new Error(`unknown elicitation id: ${id}`);
        }
        // Defensive normalization — the page is supposed to send a
        // proper ElicitationResult, but be tolerant.
        const action = ["accept", "decline", "cancel"].includes(result?.action)
            ? result.action
            : "decline";
        const content = action === "accept" && result?.content && typeof result.content === "object"
            ? result.content
            : undefined;
        entry.resolve({ action, content });
        return { ok: true };
    },

    async setActiveAdventure(gameRoot, name) {
        // Called by the page when it loads an adventure. We use this to
        // scope chat transcript persistence to the right sidecar dir.
        // Pass null/null to clear (e.g. when navigating to setup).
        if (!gameRoot || !name) {
            activeTranscriptDir = null;
            return { active: null };
        }
        const dir = await sidecarDir(gameRoot, name);
        activeTranscriptDir = dir;
        return { active: dir };
    },

    async loadChatTranscript(gameRoot, name, limit = 200) {
        // Returns the last `limit` persisted chat events for an adventure
        // so the page can seed its feed when a player opens or switches
        // adventures. Assistant HTML is regenerated from content on replay
        // so older transcript HTML cannot bypass the current markdown sanitizer.
        if (!gameRoot || !name) return { events: [] };
        const dir = await sidecarDir(gameRoot, name);
        const file = join(dir, "chat.jsonl");
        const text = await readTextOrNull(file);
        if (!text) return { events: [] };
        const lines = text
            .split(/\r?\n/)
            .map((line, index) => ({ line, lineNo: index + 1 }))
            .filter(({ line }) => line.length > 0);
        const tail = lines.slice(Math.max(0, lines.length - limit));
        const events = [];
        for (const { line, lineNo } of tail) {
            try {
                const ev = JSON.parse(line);
                if (ev?.kind === "assistant.message" || ev?.kind === "user.message") {
                    if (typeof ev.content !== "string" || ev.content === "") continue;
                }
                if (ev?.kind === "assistant.message") {
                    ev.html = renderMarkdown(ev.content);
                }
                events.push(ev);
            } catch (e) {
                process.stderr.write(
                    `[osr-game-client] corrupt chat transcript line ${file}:${lineNo}: ${e.message}\n`,
                );
            }
        }
        return { events };
    },
};

function scoreMatch(haystack, needle) {
    if (haystack === needle) return 1000;
    if (haystack.startsWith(needle)) return 500 - (haystack.length - needle.length);
    if (haystack.includes(needle)) return 200 - (haystack.length - needle.length);
    // crude character-overlap fallback
    let i = 0, j = 0, hits = 0;
    while (i < haystack.length && j < needle.length) {
        if (haystack[i] === needle[j]) {
            hits++;
            j++;
        }
        i++;
    }
    if (j === needle.length) return hits;
    return 0;
}

async function rollOnce(pluginRoot, expr) {
    if (typeof expr !== "string" || !expr.length) {
        throw new Error("expression required");
    }
    const safe = expr.length > 200 ? expr.slice(0, 200) : expr;
    const script = join(pluginRoot, "skills/referee/scripts/roll.py");
    if (!existsSync(script)) {
        return { ok: false, error: `roll.py not found at ${script}` };
    }
    return await new Promise((resolveP) => {
        const child = spawn("uv", ["run", script, safe], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let done = false;
        const finish = (result) => {
            if (done) return;
            done = true;
            resolveP(result);
        };
        child.stdout.on("data", (d) => { stdout += d.toString(); });
        child.stderr.on("data", (d) => { stderr += d.toString(); });
        child.on("error", (err) => {
            finish({ ok: false, error: `spawn error: ${err.message}` });
        });
        child.on("exit", (code) => {
            if (code === 0) {
                finish({ ok: true, expr: safe, output: stdout.trim() });
            } else {
                finish({ ok: false, expr: safe, error: stderr.trim() || `exit ${code}` });
            }
        });
        const timer = setTimeout(() => {
            child.kill();
            finish({ ok: false, expr: safe, error: "timeout (5s)" });
        }, 5000);
        child.on("exit", () => clearTimeout(timer));
    });
}

async function probeSrd(pluginRoot) {
    try {
        const index = await buildSrdIndex(pluginRoot);
        return { ok: true, count: index.entries.length };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// Reusable preamble injected into prompts the OSR Game Client sends to the
// agent. It tells the agent that the player is using the webview, so
// AskUserQuestion (elicitation) calls render as inline forms in the
// client chat — no need to avoid them, but no need to drop into a CLI
// dialog either.
function clientContextNote() {
    return (
        `[osr-game-client] The player is using the OSR Game Client webview ` +
        `to play. Their input arrives via this chat. AskUserQuestion / ` +
        `elicitation calls render as inline form bubbles in the client chat ` +
        `panel, so use them as designed at decision points (character creation, ` +
        `class/alignment selection, equipment, etc.). For simple acknowledgments ` +
        `or freeform questions, prefer plain chat replies over forms.`
    );
}

function agentPromptHeader() {
    return `${clientContextNote()}\n\n`;
}

function promptBullet(label, value) {
    return `- ${label}: \`${value}\`\n`;
}

// ---------- session reference holder + event bridge ----------

// Populated after joinSession resolves. Callbacks that need to inject a
// prompt into the agent (e.g. startNewAdventure, sendChat) check this; if
// null they reject so the page surfaces a clean error rather than a NPE.
let sessionRef = null;

// Pending elicitation requests, keyed by id. The onElicitationRequest
// handler creates an entry; the page-side respondElicitation callback
// resolves it.
const pendingElicitations = new Map();

// Push an arbitrary event payload to the page via webview.eval. Silently
// skipped when the window is closed — the CLI host still gets all events
// via its built-in flow.
//
// All pushes go through a serialized FIFO queue so backend listeners that
// fire in the SDK's natural order (assistant.message_delta, then
// assistant.message; tool.execution_start, then tool.execution_complete)
// also arrive at the page in that order. Without this, parallel
// `webview.eval()` calls could race and a late delta could clear a
// just-rendered full message.
let pushQueue = Promise.resolve();
async function pushEventToPage(payload) {
    const job = pushQueue.then(async () => {
        try {
            if (!webview || !webview._handle) return;
            const json = JSON.stringify(payload);
            await webview.eval(
                `window.osrGameClient && window.osrGameClient.event && window.osrGameClient.event(${json})`,
                { timeoutMs: 2000 },
            ).catch(() => {});
        } catch {
            // ignore — the page may not be ready yet, or the WS may have died
        }
    });
    pushQueue = job;
    // Best-effort: also append to the per-adventure transcript sidecar so
    // chat history survives client close/reopen and CLI restarts.
    appendTranscriptIfActive(payload).catch(() => {});
    return job;
}

// Active adventure for transcript persistence. Set by setActiveAdventure
// (a callback the page invokes when it loads an adventure). null means
// don't persist (e.g. setup checklist phase).
let activeTranscriptDir = null;

async function appendTranscriptIfActive(payload) {
    if (!activeTranscriptDir) return;
    // Only persist player-visible event kinds. Drop tool start/complete
    // (verbose meta), thinking events, and client-internal user msgs.
    if (!isPersistableEvent(payload)) return;
    const file = join(activeTranscriptDir, "chat.jsonl");
    const line = JSON.stringify({ ...payload, _at: Date.now() }) + "\n";
    await withFileLock(file, async () => {
        await mkdir(dirname(file), { recursive: true });
        const { appendFile } = await import("node:fs/promises");
        await appendFile(file, line, "utf8");
    });
}

function isPersistableEvent(payload) {
    if (!payload || !payload.kind) return false;
    if (payload.kind === "thinking.start" || payload.kind === "thinking.end") return false;
    if (payload.kind === "tool.start" || payload.kind === "tool.complete") {
        // Persist dice rolls (immersive); skip other tool meta.
        return payload.icon === "🎲";
    }
    if (payload.kind === "user.message" && payload.source === "client-internal") return false;
    if (payload.kind === "assistant.message_delta") return false;
    return true;
}

// Map a tool name to a single-character icon. Falls back to "•" so we
// always show something even for tools we don't recognize.
function toolIcon(toolName) {
    const t = toolName ?? "";
    if (/dice|roll/i.test(t)) return "🎲";
    if (/read|open|view|fetch/i.test(t)) return "📖";
    if (/edit|write|create|update|append/i.test(t)) return "✍";
    if (/grep|search|find|glob|list/i.test(t)) return "🔍";
    if (/bash|run|execute|shell|powershell/i.test(t)) return "⚙";
    if (/skill/i.test(t)) return "✨";
    if (/ask|question/i.test(t)) return "❓";
    return "•";
}

function summarizeToolArgs(args) {
    if (!args || typeof args !== "object") return "";
    // Trim noisy fields and stringify compactly.
    const trimmed = {};
    let count = 0;
    for (const [k, v] of Object.entries(args)) {
        if (count >= 3) break;
        let val = v;
        if (typeof val === "string" && val.length > 80) val = val.slice(0, 77) + "…";
        trimmed[k] = val;
        count++;
    }
    try {
        return JSON.stringify(trimmed);
    } catch {
        return "";
    }
}

function eventData(event, eventType) {
    const data = event?.data;
    if (data == null) return {};
    if (typeof data === "object") return data;
    console.error(`[osr-game-client] malformed ${eventType}: data`);
    return {};
}

function requiredString(data, eventType, field) {
    const value = data?.[field];
    if (typeof value === "string") return value;
    console.error(`[osr-game-client] malformed ${eventType}: ${field}`);
    return null;
}

function optionalString(data, eventType, field) {
    const value = data?.[field];
    if (value == null) return undefined;
    if (typeof value === "string") return value;
    console.error(`[osr-game-client] malformed ${eventType}: ${field}`);
    return undefined;
}

function optionalStringOrNull(data, eventType, field) {
    const value = data?.[field];
    if (value == null) return null;
    if (typeof value === "string") return value;
    console.error(`[osr-game-client] malformed ${eventType}: ${field}`);
    return null;
}

function optionalTurnId(event, eventType) {
    const data = eventData(event, eventType);
    if (!("turnId" in data) || data.turnId == null) return undefined;
    if (typeof data.turnId === "string") return data.turnId;
    console.error(`[osr-game-client] malformed ${eventType}: turnId`);
    return undefined;
}

function attachSessionListeners(session) {
    // Full assistant message (with content already rendered as markdown).
    // Tool-only turns can produce assistant.message events with no prose
    // (missing or empty content). Drop those so the chat feed doesn't grow
    // empty bubbles; they're also not worth persisting to the transcript.
    session.on("assistant.message", async (event) => {
        const data = eventData(event, "assistant.message");
        const content = optionalString(data, "assistant.message", "content");
        if (!content) return;
        await pushEventToPage({
            kind: "assistant.message",
            messageId: optionalString(data, "assistant.message", "messageId"),
            content,
            html: renderMarkdown(content),
            timestamp: event.timestamp,
        });
    });
    // Streaming delta — accumulate by messageId on the page.
    session.on("assistant.message_delta", async (event) => {
        const data = eventData(event, "assistant.message_delta");
        const messageId = requiredString(data, "assistant.message_delta", "messageId");
        const delta = requiredString(data, "assistant.message_delta", "delta");
        if (messageId == null || delta == null) return;
        await pushEventToPage({
            kind: "assistant.message_delta",
            messageId,
            delta,
            timestamp: event.timestamp,
        });
    });
    // User message reflected back so the chat panel shows what the player typed
    // (whether they typed in the webview, the CLI, or via session.send from
    // anywhere else). Pass `source` through so the page can hide
    // skill-injected synthetic messages by default. We also tag prompts the
    // OSR Game Client itself injected (Play / Resume / + New) so they don't
    // clutter the chat feed in non-verbose mode.
    session.on("user.message", async (event) => {
        const data = eventData(event, "user.message");
        const content = optionalString(data, "user.message", "content");
        if (!content) return;
        const isClientInjected = content.startsWith("[osr-game-client]");
        const source = optionalStringOrNull(data, "user.message", "source")
            ?? (isClientInjected ? "client-internal" : null);
        await pushEventToPage({
            kind: "user.message",
            content,
            source,
            timestamp: event.timestamp,
        });
    });
    session.on("tool.execution_start", async (event) => {
        const data = eventData(event, "tool.execution_start");
        const toolCallId = requiredString(data, "tool.execution_start", "toolCallId");
        if (toolCallId == null) return;
        const toolName = optionalString(data, "tool.execution_start", "toolName") ?? "";
        await pushEventToPage({
            kind: "tool.start",
            toolCallId,
            toolName,
            icon: toolIcon(toolName),
            argsSummary: summarizeToolArgs(data.arguments),
            timestamp: event.timestamp,
        });
    });
    session.on("tool.execution_complete", async (event) => {
        const data = eventData(event, "tool.execution_complete");
        const toolCallId = requiredString(data, "tool.execution_complete", "toolCallId");
        if (toolCallId == null) return;
        await pushEventToPage({
            kind: "tool.complete",
            toolCallId,
            success: data.success !== false,
            errorMessage: typeof data.error?.message === "string" ? data.error.message : undefined,
            timestamp: event.timestamp,
        });
    });
    // Drive the "Referee is thinking" indicator. Use a counter on the page
    // so any nested/parallel turns don't desync the UI.
    session.on("assistant.turn_start", async (event) => {
        await pushEventToPage({
            kind: "thinking.start",
            turnId: optionalTurnId(event, "assistant.turn_start"),
            timestamp: event.timestamp,
        });
    });
    session.on("assistant.turn_end", async (event) => {
        await pushEventToPage({
            kind: "thinking.end",
            turnId: optionalTurnId(event, "assistant.turn_end"),
            timestamp: event.timestamp,
        });
    });
}

// ---------- joinSession ----------

const webview = new CopilotWebview({
    extensionName: "osr_game_client",
    contentDir: join(import.meta.dirname, "content"),
    title: "OSR Game Client",
    width: 1280,
    height: 860,
    callbacks,
});

await joinSession({
    tools: webview.tools,
    commands: [{
        name: "osr-game-client",
        description: "Open the OSR Game Client window for the bx-referee plugin.",
        handler: async () => {
            await webview.show();
        },
    }],
    hooks: { onSessionEnd: webview.close },
    onElicitationRequest: async (ctx) => {
        // If the webview window isn't open, decline so the host falls back
        // to its own (CLI) prompt path. Same idea if the eval push fails.
        if (!webview || !webview._handle) {
            return { action: "decline" };
        }
        const id = randomUUID();
        const promise = new Promise((resolve) => {
            pendingElicitations.set(id, { resolve });
        });
        const payload = {
            id,
            message: ctx.message,
            requestedSchema: ctx.requestedSchema ?? null,
            mode: ctx.mode ?? "form",
            elicitationSource: ctx.elicitationSource ?? null,
            url: ctx.url ?? null,
        };
        try {
            await webview.eval(
                `window.osrGameClient && window.osrGameClient.elicitation && window.osrGameClient.elicitation(${JSON.stringify(payload)})`,
                { timeoutMs: 3000 },
            );
        } catch {
            pendingElicitations.delete(id);
            return { action: "decline" };
        }
        // Five-minute hard cap so a closed/dead webview can't pin the agent.
        // When it fires, also notify the page so the inline form switches to
        // an "expired" state instead of leaving an actionable form that
        // would now reject with "unknown elicitation id".
        let expired = false;
        const timeoutHandle = setTimeout(async () => {
            const entry = pendingElicitations.get(id);
            if (!entry) return;
            expired = true;
            pendingElicitations.delete(id);
            entry.resolve({ action: "cancel" });
            await pushEventToPage({
                kind: "elicitation.expired",
                elicitationId: id,
                reason: "timeout",
            }).catch(() => {});
        }, 5 * 60 * 1000);
        try {
            const result = await promise;
            return result;
        } finally {
            if (!expired) clearTimeout(timeoutHandle);
            pendingElicitations.delete(id);
        }
    },
}).then((session) => {
    sessionRef = session;
    attachSessionListeners(session);
});
