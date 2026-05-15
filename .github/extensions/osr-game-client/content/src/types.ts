// Shared types matching the shape returned by main.mjs callbacks.

export interface Setup {
    lastGameRoot: string | null;
    pluginRoot: string | null;
    pluginRootValid: boolean;
    rollProbe: { ok: boolean; output?: string; error?: string };
    srdProbe: { ok: boolean; count?: number; error?: string };
}

export interface AdventureSummary {
    name: string;
    hasParty: boolean;
    hasSession: boolean;
    lastModified: number;
}

export interface Abilities {
    str?: { score: number; mod: number };
    int?: { score: number; mod: number };
    wis?: { score: number; mod: number };
    dex?: { score: number; mod: number };
    con?: { score: number; mod: number };
    cha?: { score: number; mod: number };
}

export interface CombatStats {
    ac: number | null;
    acAscending: number | null;
    hpCurrent: number | null;
    hpMax: number | null;
    thaco: number | null;
    thacoAttackBonus: number | null;
    xp: number | null;
    xpNext: number | null;
    xpBonus: string | null;
}

export interface Saves {
    death?: number;
    wands?: number;
    paralysis?: number;
    breath?: number;
    spells?: number;
}

export interface Encumbrance {
    current: number | null;
    max: number | null;
    movePerTurn: number | null;
    movePerRound: number | null;
}

export interface Character {
    name: string;
    classRaw: string | null;
    level: number | null;
    alignment: string | null;
    pronouns: string | null;
    status: "ALIVE" | "DEAD" | string;
    abilities?: Abilities;
    combatStats?: CombatStats;
    saves?: Saves;
    equipment?: string;
    money?: string;
    languages?: string;
    spells?: string;
    specialAbilities?: string;
    thiefSkills?: string;
    clericTurning?: string;
    encumbrance?: Encumbrance;
    extra?: Record<string, string>;
    raw?: string;
    parseError?: string;
}

export interface SessionStatus {
    location?: string;
    turn?: string;
    hour?: string;
    light?: string;
}

export interface SessionLogEntry {
    heading: string;
    body: string;
}

export interface Casualty {
    name: string;
    class: string;
    cause: string;
    session: string;
}

export interface SessionData {
    status: SessionStatus;
    log: SessionLogEntry[];
    casualties: Casualty[];
    situation: string;
}

export interface LocationEntry {
    id: string;
    name: string;
    ref: string | null;
    raw: string;
}

export interface LocationSection {
    name: string;
    entries: LocationEntry[];
}

export interface LocationsData {
    modulePath: string | null;
    intro: string | null;
    sections: LocationSection[];
}

export interface Combatant {
    id: string;
    name: string;
    initiative: number;
    hpCurrent: number;
    hpMax: number;
    ac: number | null;
    isPC: boolean;
    note?: string;
    conditions: string[];
}

export interface CombatState {
    schemaVersion: number;
    round: number;
    active: number;
    combatants: Combatant[];
    savedAt?: string;
}

export interface VisitedState {
    schemaVersion: number;
    marks: Record<string, { status: "visited" | "cleared"; at: string } | undefined>;
}

export interface Mtimes {
    party: number | null;
    session: number | null;
    locations: number | null;
    combat: number | null;
    visited: number | null;
    notes: number | null;
}

export interface AdventureSnapshot {
    name: string;
    adventureDir: string;
    party: { characters: Character[]; warnings: string[] };
    session: SessionData;
    locations: LocationsData;
    combat: CombatState;
    visited: VisitedState;
    notes: string;
    mtimes: Mtimes;
}

export interface RollResult {
    ok: boolean;
    expr?: string;
    output?: string;
    error?: string;
}

export interface SrdEntry {
    title: string;
    file: string;
    category: string;
}

export interface SrdContent {
    file: string;
    title: string;
    content: string;
    html: string;
}
