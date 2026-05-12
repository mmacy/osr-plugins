import { useEffect, useState } from "react";
import { api } from "../api";
import type { SrdContent, SrdEntry } from "../types";

export function SrdLookup() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SrdEntry[]>([]);
    const [selected, setSelected] = useState<SrdContent | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                const r = await api.searchSrd(query);
                if (!cancelled) setResults(r.entries);
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            }
        };
        const handle = setTimeout(run, query ? 150 : 0);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [query]);

    const open = async (entry: SrdEntry) => {
        setLoading(true);
        setError(null);
        try {
            const content = await api.readSrd(entry.file);
            setSelected(content);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="srd">
            <div className="index">
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search rules / monsters / spells…"
                    autoFocus
                />
                {error && <div className="warning">{error}</div>}
                {results.length === 0 ? (
                    <div className="muted center" style={{ padding: "0.5rem" }}>
                        {query ? "No matches." : "Type to search the SRD."}
                    </div>
                ) : (
                    results.map((r) => (
                        <div
                            key={r.file + r.title}
                            className={`item ${selected?.file === r.file ? "selected" : ""}`}
                            onClick={() => open(r)}
                        >
                            <span>{r.title}</span>
                            <span className="cat">{shortCat(r.category)}</span>
                        </div>
                    ))
                )}
            </div>
            <div className="content">
                {loading && <div className="muted">Loading…</div>}
                {!loading && !selected && (
                    <div className="empty">
                        Select an entry from the index to view its SRD page.
                    </div>
                )}
                {selected && (
                    <div dangerouslySetInnerHTML={{ __html: selected.html }} />
                )}
            </div>
        </div>
    );
}

function shortCat(category: string): string {
    if (category === "monsters") return "mon";
    if (category === "spells") return "spl";
    if (category === "rules") return "rule";
    return category.slice(0, 4);
}
