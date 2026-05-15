import type { Setup } from "../types";
import { useState } from "react";
import { api } from "../api";

interface Props {
    setup: Setup;
    onSetupChanged: (setup: Setup) => void;
    suggestedGameRoot: string;
}

// First-run setup checklist. Each step shows a tick or an actionable error.
// Until game root + plugin root are valid, the rest of the UI is hidden.
export function SetupChecklist({ setup, onSetupChanged, suggestedGameRoot }: Props) {
    const [gameRootInput, setGameRootInput] = useState(setup.lastGameRoot ?? suggestedGameRoot);
    const [pluginRootInput, setPluginRootInput] = useState(setup.pluginRoot ?? "");
    const [busy, setBusy] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const refresh = async () => {
        setBusy("refresh");
        try {
            const next = await api.getSetup();
            onSetupChanged(next);
        } finally {
            setBusy(null);
        }
    };

    const saveGameRoot = async () => {
        setBusy("game");
        setErrors((e) => ({ ...e, game: "" }));
        try {
            await api.setGameRoot(gameRootInput);
            await refresh();
        } catch (e) {
            setErrors((errs) => ({ ...errs, game: (e as Error).message }));
        } finally {
            setBusy(null);
        }
    };

    const savePluginRoot = async () => {
        setBusy("plugin");
        setErrors((e) => ({ ...e, plugin: "" }));
        try {
            await api.setPluginRoot(pluginRootInput);
            await refresh();
        } catch (e) {
            setErrors((errs) => ({ ...errs, plugin: (e as Error).message }));
        } finally {
            setBusy(null);
        }
    };

    const gameOk = !!setup.lastGameRoot;
    const pluginOk = setup.pluginRootValid;
    const rollOk = setup.rollProbe.ok;
    const srdOk = setup.srdProbe.ok;

    return (
        <div className="setup">
            <h1>OSR Game Client</h1>
            <div className="sub">
                Live client for the bx-referee plugin. Configure these once and
                you're ready to play.
            </div>

            <div className={`step ${gameOk ? "ok" : "warn"}`}>
                <div className="icon">{gameOk ? "✓" : "1"}</div>
                <div className="body">
                    <div className="label">Game directory</div>
                    <div className="detail">
                        Where adventures and characters are saved.{" "}
                        {gameOk ? <code>{setup.lastGameRoot}</code> : `Suggested: ${suggestedGameRoot}`}
                    </div>
                    <div className="actions">
                        <input
                            type="text"
                            value={gameRootInput}
                            onChange={(e) => setGameRootInput(e.target.value)}
                            placeholder={suggestedGameRoot}
                        />
                        <button
                            className="primary"
                            onClick={saveGameRoot}
                            disabled={busy !== null || !gameRootInput.trim()}
                        >
                            {gameOk ? "Update" : "Use this folder"}
                        </button>
                    </div>
                    {errors.game && <div className="warning">{errors.game}</div>}
                </div>
            </div>

            <div className={`step ${pluginOk ? "ok" : "warn"}`}>
                <div className="icon">{pluginOk ? "✓" : "2"}</div>
                <div className="body">
                    <div className="label">bx-referee plugin location</div>
                    <div className="detail">
                        {pluginOk
                            ? <>Detected at <code>{setup.pluginRoot}</code></>
                            : "Auto-detect failed. Enter the path to the bx-referee plugin folder (must contain skills/referee/scripts/roll.py)."}
                    </div>
                    {!pluginOk && (
                        <div className="actions">
                            <input
                                type="text"
                                value={pluginRootInput}
                                onChange={(e) => setPluginRootInput(e.target.value)}
                                placeholder="~/.copilot/installed-plugins/_direct/bx-referee"
                            />
                            <button
                                className="primary"
                                onClick={savePluginRoot}
                                disabled={busy !== null || !pluginRootInput.trim()}
                            >
                                Set plugin root
                            </button>
                        </div>
                    )}
                    {errors.plugin && <div className="warning">{errors.plugin}</div>}
                </div>
            </div>

            <div className={`step ${rollOk ? "ok" : "bad"}`}>
                <div className="icon">{rollOk ? "✓" : "!"}</div>
                <div className="body">
                    <div className="label">Dice roller</div>
                    <div className="detail">
                        {rollOk
                            ? <>Test roll succeeded: <code>1d20 → {setup.rollProbe.output}</code></>
                            : <>Could not run roll.py: <code>{setup.rollProbe.error}</code> — make sure <code>uv</code> is on PATH.</>}
                    </div>
                </div>
            </div>

            <div className={`step ${srdOk ? "ok" : "bad"}`}>
                <div className="icon">{srdOk ? "✓" : "!"}</div>
                <div className="body">
                    <div className="label">SRD reference index</div>
                    <div className="detail">
                        {srdOk
                            ? <>Indexed {setup.srdProbe.count} SRD entries.</>
                            : <>Could not load SRD index: <code>{setup.srdProbe.error}</code></>}
                    </div>
                </div>
            </div>

            <div className="actions" style={{ marginTop: "1rem" }}>
                <button onClick={refresh} disabled={busy !== null}>
                    {busy === "refresh" ? "Re-checking…" : "Re-check"}
                </button>
            </div>
        </div>
    );
}
