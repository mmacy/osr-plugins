import { useMemo, useState } from "react";
import { api } from "../api";
import type { AdventureSnapshot, LocationEntry, VisitedState } from "../types";

interface Props {
    snapshot: AdventureSnapshot;
    gameRoot: string;
    adventureName: string;
    onSnapshotChange: (next: AdventureSnapshot) => void;
}

export function Locations({ snapshot, gameRoot, adventureName, onSnapshotChange }: Props) {
    const { locations, visited } = snapshot;
    const [query, setQuery] = useState("");

    const filteredSections = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return locations.sections;
        return locations.sections
            .map((s) => ({
                ...s,
                entries: s.entries.filter((e) =>
                    `${e.id} ${e.name}`.toLowerCase().includes(q)
                ),
            }))
            .filter((s) => s.entries.length > 0);
    }, [locations.sections, query]);

    const cycleStatus = async (entry: LocationEntry) => {
        const current = visited.marks[entry.id]?.status;
        const next: "visited" | "cleared" | null =
            current === undefined ? "visited"
            : current === "visited" ? "cleared"
            : null;
        const result = await api.setLocationVisited(
            gameRoot,
            adventureName,
            entry.id,
            next,
        ) as VisitedState;
        onSnapshotChange({ ...snapshot, visited: result });
    };

    const totalEntries = locations.sections.reduce((n, s) => n + s.entries.length, 0);
    const visitedCount = Object.values(visited.marks).filter(Boolean).length;

    return (
        <div className="locations">
            <div className="module-info">
                {locations.modulePath ? (
                    <>Module: <code>{locations.modulePath}</code></>
                ) : (
                    "No module path recorded in LOCATIONS.md."
                )}
                {locations.intro && (
                    <> · Intro: <code>{locations.intro}</code></>
                )}
                <span style={{ marginLeft: "0.75rem" }}>
                    · Visited {visitedCount}/{totalEntries}
                </span>
            </div>
            <input
                className="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search locations…"
            />
            {filteredSections.length === 0 ? (
                <div className="empty">
                    {totalEntries === 0
                        ? "LOCATIONS.md is empty or does not exist for this adventure."
                        : "No matches."}
                </div>
            ) : filteredSections.map((s) => (
                <div className="section" key={s.name}>
                    <h3>{s.name}</h3>
                    <div className="entries">
                        {s.entries.map((e) => {
                            const status = visited.marks[e.id]?.status;
                            return (
                                <div
                                    key={e.id}
                                    className={`entry ${status ?? ""}`}
                                    onClick={() => cycleStatus(e)}
                                    title="Click to cycle: unvisited → visited → cleared → unvisited"
                                >
                                    <span className="id">{e.id}</span>
                                    <span className="name">{e.name}</span>
                                    {status ? (
                                        <span className="mark">{status}</span>
                                    ) : (
                                        <span className="ref">{e.ref ?? ""}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
