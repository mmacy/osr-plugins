import { useState } from "react";
import type { Character } from "../types";

interface Props {
    character: Character;
    defaultExpanded?: boolean;
}

// Compact single-row character entry. Always-visible essentials: name,
// class/level, HP bar, AC, THAC0, dead/condition badges. Click anywhere
// on the row to toggle inline expansion with abilities, saves, XP bar,
// equipment, money, ENC, languages, spells, special abilities, thief
// skills, cleric turning. Multiple rows can be expanded simultaneously.
export function CharacterCard({ character, defaultExpanded = false }: Props) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const stats = character.combatStats;
    const isDead = character.status === "DEAD"
        || (stats?.hpCurrent != null && stats.hpCurrent <= 0);
    const xpPct = stats?.xp != null && stats?.xpNext != null && stats.xpNext > 0
        ? Math.min(100, (stats.xp / stats.xpNext) * 100)
        : null;

    return (
        <div className={`pc ${isDead ? "dead" : ""} ${expanded ? "expanded" : ""}`}>
            <button
                type="button"
                className="pc-row"
                onClick={() => setExpanded((x) => !x)}
                aria-expanded={expanded}
            >
                <span className="pc-name">{character.name}</span>
                <span className="pc-clazz">
                    {character.classRaw ?? "—"}
                    {character.level != null ? ` L${character.level}` : ""}
                </span>
                <HpBar
                    current={stats?.hpCurrent ?? 0}
                    max={stats?.hpMax ?? 0}
                />
                <span className="pc-stat" title="Armor Class">
                    <span className="muted">AC</span> {stats?.ac ?? "—"}
                </span>
                <span className="pc-stat" title="THAC0">
                    <span className="muted">T0</span> {stats?.thaco ?? "—"}
                </span>
                <span className="pc-badges">
                    {isDead && <span className="pc-badge dead">SLAIN</span>}
                    {character.parseError && (
                        <span className="pc-badge warn" title={character.parseError}>?</span>
                    )}
                </span>
                <span className="pc-chev">{expanded ? "▾" : "▸"}</span>
            </button>

            {expanded && (
                <div className="pc-detail">
                    <div className="pc-detail-row">
                        {character.alignment && (
                            <span className="pc-meta">{character.alignment}</span>
                        )}
                        {character.pronouns && (
                            <span className="pc-meta">({character.pronouns})</span>
                        )}
                        {stats && (
                            <span className="pc-meta">
                                XP {fmtNum(stats.xp)} / {fmtNum(stats.xpNext)}
                                {stats.xpBonus ? ` (${stats.xpBonus})` : ""}
                            </span>
                        )}
                        {character.encumbrance && (
                            <span className="pc-meta">
                                ENC {fmtNum(character.encumbrance.current)}/{fmtNum(character.encumbrance.max)}
                                {character.encumbrance.movePerTurn != null && (
                                    <> · MV {character.encumbrance.movePerTurn}'</>
                                )}
                            </span>
                        )}
                    </div>

                    {xpPct != null && (
                        <div className="xp-bar"><div className="fill" style={{ width: `${xpPct}%` }} /></div>
                    )}

                    {character.parseError && (
                        <div className="warning">
                            ⚠ Could not fully parse this character: {character.parseError}
                        </div>
                    )}

                    <div className="pc-detail-grid">
                        {character.abilities && (
                            <div className="ability-column">
                                <div className="col-title">Abilities</div>
                                {(["str", "int", "wis", "dex", "con", "cha"] as const).map((k) => {
                                    const a = character.abilities?.[k];
                                    if (!a) return null;
                                    return (
                                        <div className="ability-row" key={k}>
                                            <span className="ability-label">{abilityFullName(k)}</span>
                                            <span className="ability-score">{a.score}</span>
                                            <span className="ability-mod">
                                                {a.mod !== 0 ? fmtMod(a.mod) : "—"}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {character.saves && (
                            <div className="ability-column">
                                <div className="col-title">Saving Throws</div>
                                {(["death", "wands", "paralysis", "breath", "spells"] as const).map((k) => {
                                    const v = character.saves?.[k];
                                    return (
                                        <div className="ability-row" key={k}>
                                            <span className="ability-label">{saveLongName(k)}</span>
                                            <span className="ability-score">{v ?? "—"}</span>
                                            <span className="ability-mod" />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {character.spells && (
                        <DetailLine label="Spells" value={character.spells} highlight />
                    )}
                    {character.specialAbilities && (
                        <DetailLine label="Special abilities" value={character.specialAbilities} />
                    )}
                    {character.thiefSkills && (
                        <DetailLine label="Thief skills" value={character.thiefSkills} />
                    )}
                    {character.clericTurning && (
                        <DetailLine label="Cleric turning" value={character.clericTurning} />
                    )}
                    {character.equipment && (
                        <DetailLine label="Equipment" value={character.equipment} />
                    )}
                    {character.money && (
                        <DetailLine label="Money" value={character.money} />
                    )}
                    {character.languages && (
                        <DetailLine label="Languages" value={character.languages} />
                    )}
                </div>
            )}
        </div>
    );
}

function DetailLine({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`pc-line ${highlight ? "highlight" : ""}`}>
            <span className="pc-line-label">{label}:</span>
            <span className="pc-line-value">{value}</span>
        </div>
    );
}

function HpBar({ current, max }: { current: number; max: number }) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    let color = "var(--hp-good)";
    if (current <= 0) color = "var(--hp-dead)";
    else if (pct < 25) color = "var(--hp-bad)";
    else if (pct < 60) color = "var(--hp-warn)";
    return (
        <div className="pc-hp" title={`${current}/${max} HP`}>
            <div className="pc-hp-bar">
                <div className="fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="pc-hp-label">{current}/{max}</span>
        </div>
    );
}

function fmtMod(mod: number): string {
    if (mod > 0) return `+${mod}`;
    return `${mod}`;
}

function fmtNum(n: number | null | undefined): string {
    if (n == null) return "—";
    return n.toLocaleString();
}


function abilityFullName(k: string): string {
    return {
        str: "Strength",
        int: "Intelligence",
        wis: "Wisdom",
        dex: "Dexterity",
        con: "Constitution",
        cha: "Charisma",
    }[k] ?? k.toUpperCase();
}

function saveLongName(k: string): string {
    return {
        death: "Poison or Death Ray",
        wands: "Magic Wand",
        paralysis: "Paralysis or Petrify",
        breath: "Dragon Breath",
        spells: "Spells or Magic Staff",
    }[k] ?? k;
}
