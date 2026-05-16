#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["ruamel.yaml>=0.18"]
# ///
"""Deterministic CLI for Ironsworn rules adjudication.

Stateless: the agent passes current state as arguments, this script returns
deterministic results. The agent owns all persistent state files.

Every response is JSON on stdout with a `schema_version` field. Errors are
returned as JSON with an `error` field rather than raising.
"""

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML

_yaml = YAML(typ="safe", pure=True)

SCHEMA_VERSION = 1
SCRIPT_DIR = Path(__file__).resolve().parent
DATASWORN_DIR = SCRIPT_DIR.parent / "references" / "datasworn"

YESNO_THRESHOLDS = {
    "almost_certain": 11,
    "likely": 26,
    "50_50": 51,
    "unlikely": 76,
    "small_chance": 91,
}

RANK_TO_TICKS = {
    "troublesome": 12,
    "dangerous": 8,
    "formidable": 4,
    "extreme": 2,
    "epic": 1,
}

RANK_LABELS = {1: "troublesome", 2: "dangerous", 3: "formidable", 4: "extreme", 5: "epic"}

INTERNAL_FIELDS = {"_id", "_source", "_i18n", "_comment"}


def out(data: dict) -> None:
    """Print a JSON response with schema_version prefix."""
    payload = {"schema_version": SCHEMA_VERSION, **data}
    print(json.dumps(payload, ensure_ascii=False))


def err(code: str, message: str, **extra: Any) -> None:
    """Print a JSON error response and exit non-zero."""
    out({"error": {"code": code, "message": message, **extra}})
    sys.exit(2)


def filter_metadata(obj: Any) -> Any:
    """Strip internal Datasworn fields from agent-facing output."""
    if isinstance(obj, dict):
        return {k: filter_metadata(v) for k, v in obj.items() if k not in INTERNAL_FIELDS}
    if isinstance(obj, list):
        return [filter_metadata(x) for x in obj]
    return obj


def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return _yaml.load(f)


def build_indices() -> dict:
    """Walk vendored Datasworn YAML and build flat lookup indices.

    Returns a dict with keys: moves, oracles, assets, npcs, truths, rules.
    Move IDs use leaf names (e.g. `face_danger`). Oracle IDs use the full
    namespaced form (e.g. `classic/action_and_theme/action` or
    `classic/fate/pay_the_price/pay_the_price` for embedded oracles).
    """
    idx = {"moves": {}, "oracles": {}, "assets": {}, "npcs": {}, "truths": {}, "rules": {}}

    moves_data = load_yaml(DATASWORN_DIR / "moves.yaml")
    for category, cat in (moves_data.get("moves") or {}).items():
        for move_id, move in (cat.get("contents") or {}).items():
            idx["moves"][move_id] = move
            for emb_id, emb in (move.get("oracles") or {}).items():
                full_id = f"classic/{category}/{move_id}/{emb_id}"
                idx["oracles"][full_id] = emb

    for path in sorted((DATASWORN_DIR / "oracles").glob("*.yaml")):
        data = load_yaml(path)
        _walk_oracles(data.get("oracles") or {}, f"classic", idx["oracles"])

    for path in sorted((DATASWORN_DIR / "assets").glob("*.yaml")):
        data = load_yaml(path)
        for cat_id, cat in (data.get("assets") or {}).items():
            for asset_id, asset in (cat.get("contents") or {}).items():
                idx["assets"][asset_id] = {**asset, "_category": cat_id}

    npcs_data = load_yaml(DATASWORN_DIR / "npcs.yaml")
    for cat_id, cat in (npcs_data.get("npcs") or {}).items():
        for npc_id, npc in (cat.get("contents") or {}).items():
            idx["npcs"][npc_id] = {**npc, "_category": cat_id}

    truths_data = load_yaml(DATASWORN_DIR / "truths.yaml")
    for truth_id, truth in (truths_data.get("truths") or {}).items():
        idx["truths"][truth_id] = truth

    idx["rules"] = load_yaml(DATASWORN_DIR / "rules.yaml").get("rules") or {}

    return idx


def _walk_oracles(node: dict, prefix: str, into: dict) -> None:
    """Recursively walk an oracle tree, registering every rollable table.

    Walks both `contents` and `collections` sub-trees; Datasworn nests
    rollable tables under either depending on whether the parent is a
    collection of tables or a collection of collections.
    """
    for key, val in node.items():
        if not isinstance(val, dict):
            continue
        path = f"{prefix}/{key}"
        if "rows" in val:
            into[path] = val
        if "contents" in val:
            _walk_oracles(val["contents"], path, into)
        if "collections" in val:
            _walk_oracles(val["collections"], path, into)


def _dice_for_table(table: dict) -> int:
    """Infer the die size for a table from the max row max value."""
    rows = table.get("rows") or []
    if not rows:
        return 100
    max_val = max((r.get("roll", {}).get("max") or 0) for r in rows)
    if max_val <= 6:
        return 6
    if max_val <= 10:
        return 10
    if max_val <= 20:
        return 20
    if max_val <= 36:
        return 36
    return 100


def _find_row(table: dict, roll: int) -> dict | None:
    for row in table.get("rows") or []:
        r = row.get("roll") or {}
        if r.get("min") is not None and r.get("max") is not None:
            if r["min"] <= roll <= r["max"]:
                return row
    return None


def _roll_die(sides: int) -> int:
    return random.randint(1, sides)


def _parse_challenge_dice(spec: str | None) -> list[int]:
    if spec is None:
        return [_roll_die(10), _roll_die(10)]
    try:
        cd = [int(x) for x in spec.split(",")]
    except ValueError:
        err("bad_input", "challenge-dice must be two comma-separated ints, e.g. 4,8")
    if len(cd) != 2:
        err("bad_input", "challenge-dice must be two comma-separated ints, e.g. 4,8")
    return cd


def action_roll(
    value: int,
    adds: int = 0,
    momentum: int = 2,
    momentum_reset: int = 2,
    burn: bool = False,
    label: str = "",
    action_die: int | None = None,
    challenge_dice: list[int] | None = None,
) -> dict:
    """Pure action-roll computation. Returns the result dict (no I/O)."""
    ad_raw = action_die if action_die is not None else _roll_die(6)
    cd = challenge_dice if challenge_dice is not None else [_roll_die(10), _roll_die(10)]

    cancelled = momentum < 0 and ad_raw == abs(momentum)
    ad_eff = 0 if cancelled else ad_raw

    raw_score = ad_eff + value + adds
    capped_score = min(raw_score, 10)
    capped = raw_score > 10

    def hit_for(score: int) -> str:
        beats_a = score > cd[0]
        beats_b = score > cd[1]
        if beats_a and beats_b:
            return "strong"
        if beats_a or beats_b:
            return "weak"
        return "miss"

    normal_hit = hit_for(capped_score)
    burn_hit = hit_for(min(momentum, 10)) if momentum > 0 else "miss"
    hit_rank = {"miss": 0, "weak": 1, "strong": 2}
    burn_available = hit_rank[burn_hit] > hit_rank[normal_hit]

    final_hit = normal_hit
    final_score = capped_score
    burned = False
    momentum_after_burn: int | None = None
    if burn and momentum > 0:
        final_score = min(momentum, 10)
        final_hit = hit_for(final_score)
        momentum_after_burn = momentum_reset
        burned = True

    match = cd[0] == cd[1]
    match_value = cd[0] if match else None

    return {
        "label": label,
        "action_die": ad_raw,
        "action_die_cancelled": cancelled,
        "value": value,
        "adds": adds,
        "momentum": momentum,
        "momentum_reset": momentum_reset,
        "raw_action_score": raw_score,
        "action_score": final_score,
        "capped": capped,
        "challenge_dice": cd,
        "hit": final_hit,
        "match": match,
        "match_value": match_value,
        "momentum_burn_available": burn_available and not burned,
        "burned": burned,
        "momentum_after_burn": momentum_after_burn,
    }


def cmd_action(args: argparse.Namespace) -> None:
    result = action_roll(
        value=args.value,
        adds=args.adds,
        momentum=args.momentum,
        momentum_reset=args.momentum_reset,
        burn=args.burn,
        label=args.label,
        action_die=args.action_die,
        challenge_dice=_parse_challenge_dice(args.challenge_dice) if args.challenge_dice else None,
    )
    out({"subcommand": "action", **result})


def cmd_oracle_yesno(args: argparse.Namespace) -> None:
    odds = args.odds
    if odds not in YESNO_THRESHOLDS:
        err("bad_input", f"unknown odds: {odds}", valid=list(YESNO_THRESHOLDS))

    roll = args.oracle_roll if args.oracle_roll is not None else _roll_die(100)
    threshold = YESNO_THRESHOLDS[odds]
    yes = roll >= threshold
    # match detection: doubles 11, 22, ..., 99, and 100 (00 on d10s)
    match = roll == 100 or (roll % 11 == 0 and 11 <= roll <= 99)

    out({
        "subcommand": "oracle_yesno",
        "odds": odds,
        "threshold": threshold,
        "roll": roll,
        "yes": yes,
        "match": match,
    })


def cmd_oracle_table(args: argparse.Namespace, idx: dict | None = None) -> None:
    if idx is None:
        idx = build_indices()
    table = idx["oracles"].get(args.id)
    if table is None:
        err("not_found", f"unknown oracle id: {args.id}",
            hint="use full namespaced form, e.g. classic/action_and_theme/action")

    result = _roll_table(table, args.id, idx, args.oracle_roll, depth=0)
    out({"subcommand": "oracle_table", **result})


def _roll_table(table: dict, table_id: str, idx: dict, force_roll: int | None, depth: int) -> dict:
    if depth > 3:
        return {"id": table_id, "depth_exceeded": True}
    sides = _dice_for_table(table)
    roll = force_roll if force_roll is not None else _roll_die(sides)
    row = _find_row(table, roll)
    if row is None:
        return {"id": table_id, "roll": roll, "error": "no matching row"}

    text = row.get("text", "")
    payload: dict = {"id": table_id, "dice": f"1d{sides}", "roll": roll, "text": text}

    subrolls: list[dict] = []
    for sub_directive in row.get("oracle_rolls") or []:
        n = sub_directive.get("number_of_rolls", 1)
        target_id = sub_directive.get("oracle") or table_id
        target_table = idx["oracles"].get(target_id, table)
        rolled_values: list[int] = []
        for _ in range(n):
            r = _roll_die(_dice_for_table(target_table))
            while sub_directive.get("duplicates") == "reroll" and r in rolled_values:
                r = _roll_die(_dice_for_table(target_table))
            rolled_values.append(r)
            subrolls.append(_roll_table(target_table, target_id, idx, r, depth + 1))
    if subrolls:
        payload["subrolls"] = subrolls

    return payload


def cmd_move(args: argparse.Namespace, idx: dict | None = None) -> None:
    if idx is None:
        idx = build_indices()
    move = idx["moves"].get(args.id)
    if move is None:
        err("not_found", f"unknown move id: {args.id}",
            hint="run `iron list moves` to see all ids")
    out({"subcommand": "move", "id": args.id, "move": filter_metadata(move)})


def cmd_progress_mark(args: argparse.Namespace) -> None:
    rank = args.rank.lower()
    if rank not in RANK_TO_TICKS:
        err("bad_input", f"unknown rank: {rank}", valid=list(RANK_TO_TICKS))
    ticks = RANK_TO_TICKS[rank]
    out({
        "subcommand": "progress_mark",
        "rank": rank,
        "ticks": ticks,
        "boxes_equivalent": ticks / 4,
    })


def cmd_progress_bond(_args: argparse.Namespace) -> None:
    out({
        "subcommand": "progress_bond",
        "ticks": 1,
        "note": "Bonds always mark 1 tick regardless of rank (rulebook p. 16).",
    })


def cmd_progress_roll(args: argparse.Namespace) -> None:
    if args.ticks < 0 or args.ticks > 40:
        err("bad_input", f"ticks must be 0-40, got {args.ticks}")
    score = args.ticks // 4
    cd = _parse_challenge_dice(args.challenge_dice) if args.challenge_dice else [_roll_die(10), _roll_die(10)]
    beats_a = score > cd[0]
    beats_b = score > cd[1]
    if beats_a and beats_b:
        hit = "strong"
    elif beats_a or beats_b:
        hit = "weak"
    else:
        hit = "miss"
    match = cd[0] == cd[1]
    out({
        "subcommand": "progress_roll",
        "ticks": args.ticks,
        "boxes_filled": score,
        "challenge_dice": cd,
        "hit": hit,
        "match": match,
        "match_value": cd[0] if match else None,
    })


def cmd_momentum_bounds(args: argparse.Namespace) -> None:
    """Derive momentum max and reset from debility count (rulebook p. 13).

    Max momentum starts at +10 and is reduced by 1 per debility.
    Reset is +2 (0 debilities), +1 (1), 0 (2+).
    """
    d = args.debilities
    if d < 0:
        err("bad_input", f"debilities must be non-negative, got {d}")
    momentum_max = max(0, 10 - d)
    if d == 0:
        momentum_reset = 2
    elif d == 1:
        momentum_reset = 1
    else:
        momentum_reset = 0
    out({
        "subcommand": "momentum_bounds",
        "debilities": d,
        "max": momentum_max,
        "reset": momentum_reset,
        "min": -6,
    })


def cmd_suffer_harm(args: argparse.Namespace) -> None:
    health = args.health
    iron = args.iron
    harm = args.harm
    momentum = args.momentum

    if harm < 0 or health < 0 or iron < 0:
        err("bad_input", "health, iron, harm must be non-negative")

    damage_to_health = min(health, harm)
    new_health = health - damage_to_health
    spill_to_momentum = harm - damage_to_health
    new_momentum = momentum - spill_to_momentum

    roll_value = max(new_health, iron)
    roll_label = "health" if new_health >= iron else "iron"

    result = action_roll(
        value=roll_value,
        adds=0,
        momentum=new_momentum,
        momentum_reset=args.momentum_reset,
        burn=args.burn,
        label=roll_label,
        action_die=args.action_die,
        challenge_dice=_parse_challenge_dice(args.challenge_dice) if args.challenge_dice else None,
    )

    pending_choice: str | None = None
    if result["hit"] == "miss" and new_health == 0:
        pending_choice = "mark_debility_or_roll_fate_table"

    out({
        "subcommand": "suffer_harm",
        "input": {"health": health, "iron": iron, "harm": harm, "momentum": momentum},
        "state_after_damage": {
            "health": new_health,
            "momentum": new_momentum,
            "spill_to_momentum": spill_to_momentum,
        },
        "roll": result,
        "roll_value": roll_value,
        "roll_label": roll_label,
        "pending_choice": pending_choice,
        "fate_table_id": "classic/suffer/endure_harm/endure_harm" if pending_choice else None,
    })


def cmd_suffer_stress(args: argparse.Namespace) -> None:
    spirit = args.spirit
    heart = args.heart
    stress = args.stress
    momentum = args.momentum

    if stress < 0 or spirit < 0 or heart < 0:
        err("bad_input", "spirit, heart, stress must be non-negative")

    damage_to_spirit = min(spirit, stress)
    new_spirit = spirit - damage_to_spirit
    spill_to_momentum = stress - damage_to_spirit
    new_momentum = momentum - spill_to_momentum

    roll_value = max(new_spirit, heart)
    roll_label = "spirit" if new_spirit >= heart else "heart"

    result = action_roll(
        value=roll_value,
        adds=0,
        momentum=new_momentum,
        momentum_reset=args.momentum_reset,
        burn=args.burn,
        label=roll_label,
        action_die=args.action_die,
        challenge_dice=_parse_challenge_dice(args.challenge_dice) if args.challenge_dice else None,
    )

    pending_choice: str | None = None
    if result["hit"] == "miss" and new_spirit == 0:
        pending_choice = "mark_debility_or_roll_fate_table"

    out({
        "subcommand": "suffer_stress",
        "input": {"spirit": spirit, "heart": heart, "stress": stress, "momentum": momentum},
        "state_after_damage": {
            "spirit": new_spirit,
            "momentum": new_momentum,
            "spill_to_momentum": spill_to_momentum,
        },
        "roll": result,
        "roll_value": roll_value,
        "roll_label": roll_label,
        "pending_choice": pending_choice,
        "fate_table_id": "classic/suffer/endure_stress/endure_stress" if pending_choice else None,
    })


def cmd_asset(args: argparse.Namespace, idx: dict | None = None) -> None:
    if idx is None:
        idx = build_indices()
    asset = idx["assets"].get(args.id)
    if asset is None:
        err("not_found", f"unknown asset id: {args.id}",
            hint="run `iron list assets` to see all ids")
    out({"subcommand": "asset", "id": args.id, "asset": filter_metadata(asset)})


def cmd_npc(args: argparse.Namespace, idx: dict | None = None) -> None:
    if idx is None:
        idx = build_indices()
    npc = idx["npcs"].get(args.id)
    if npc is None:
        err("not_found", f"unknown npc id: {args.id}",
            hint="run `iron list npcs` to see all ids")
    rank = npc.get("rank") or 1
    rank_label = RANK_LABELS.get(rank, "unknown")
    harm = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5}.get(rank, 1)
    ticks_per_strike = RANK_TO_TICKS.get(rank_label, 0)
    out({
        "subcommand": "npc",
        "id": args.id,
        "rank": rank,
        "rank_label": rank_label,
        "harm_inflicted": harm,
        "progress_ticks_per_strike": ticks_per_strike,
        "npc": filter_metadata(npc),
    })


def cmd_truths(args: argparse.Namespace, idx: dict | None = None) -> None:
    if idx is None:
        idx = build_indices()
    truth = idx["truths"].get(args.id)
    if truth is None:
        err("not_found", f"unknown truth id: {args.id}",
            hint="run `iron list truths` to see all ids")
    payload: dict = {"subcommand": "truths", "id": args.id, "truth": filter_metadata(truth)}
    if args.roll is not None:
        roll = args.roll
        chosen = None
        for opt in truth.get("options") or []:
            r = opt.get("roll") or {}
            if r.get("min") is not None and r.get("min") <= roll <= r.get("max", roll):
                chosen = opt
                break
        payload["roll"] = roll
        payload["chosen"] = filter_metadata(chosen) if chosen else None
    out(payload)


def cmd_list(args: argparse.Namespace, idx: dict | None = None) -> None:
    if idx is None:
        idx = build_indices()
    if args.type not in idx:
        err("bad_input", f"unknown list type: {args.type}", valid=sorted(idx))
    ids = sorted(idx[args.type].keys())
    out({"subcommand": "list", "type": args.type, "count": len(ids), "ids": ids})


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="iron", description="Ironsworn deterministic rules CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    pa = sub.add_parser("action", help="Action roll: d6+value+adds vs 2d10")
    pa.add_argument("--value", type=int, required=True, help="The stat/track/companion value being rolled (numeric)")
    pa.add_argument("--label", type=str, default="", help="Label for the value (for logging, e.g. 'edge')")
    pa.add_argument("--adds", type=int, default=0)
    pa.add_argument("--momentum", type=int, default=2)
    pa.add_argument("--momentum-reset", type=int, default=2)
    pa.add_argument("--burn", action="store_true", help="Burn momentum: replace action score with momentum, then reset")
    pa.add_argument("--action-die", type=int, default=None, help="(test only) force the d6")
    pa.add_argument("--challenge-dice", type=str, default=None, help="(test only) force the 2d10, e.g. 4,8")
    pa.set_defaults(func=cmd_action)

    po = sub.add_parser("oracle", help="Oracle rolls")
    po_sub = po.add_subparsers(dest="oracle_cmd", required=True)
    poy = po_sub.add_parser("yesno", help="Yes/no oracle with odds")
    poy.add_argument("--odds", type=str, required=True, choices=sorted(YESNO_THRESHOLDS))
    poy.add_argument("--oracle-roll", type=int, default=None)
    poy.set_defaults(func=cmd_oracle_yesno)

    pot = po_sub.add_parser("table", help="Roll on a table oracle by id")
    pot.add_argument("id", type=str, help="full namespaced id, e.g. classic/action_and_theme/action")
    pot.add_argument("--oracle-roll", type=int, default=None)
    pot.set_defaults(func=cmd_oracle_table)

    pm = sub.add_parser("move", help="Look up a move by id")
    pm.add_argument("id", type=str)
    pm.set_defaults(func=cmd_move)

    pp = sub.add_parser("progress", help="Progress tracks: mark, roll, bond")
    pp_sub = pp.add_subparsers(dest="progress_cmd", required=True)
    ppm = pp_sub.add_parser("mark", help="Ticks per rank")
    ppm.add_argument("--rank", required=True, type=str,
                     choices=sorted(RANK_TO_TICKS))
    ppm.set_defaults(func=cmd_progress_mark)
    ppb = pp_sub.add_parser("bond", help="Bonds always mark 1 tick")
    ppb.set_defaults(func=cmd_progress_bond)
    ppr = pp_sub.add_parser("roll", help="Progress roll: ticks//4 vs 2d10")
    ppr.add_argument("--ticks", required=True, type=int)
    ppr.add_argument("--challenge-dice", type=str, default=None)
    ppr.set_defaults(func=cmd_progress_roll)

    pmom = sub.add_parser("momentum", help="Momentum helpers")
    pmom_sub = pmom.add_subparsers(dest="momentum_cmd", required=True)
    pmb = pmom_sub.add_parser("bounds", help="Derive max/reset from debility count")
    pmb.add_argument("--debilities", required=True, type=int)
    pmb.set_defaults(func=cmd_momentum_bounds)

    ps = sub.add_parser("suffer", help="Suffer moves: harm, stress (state-sequenced)")
    ps_sub = ps.add_subparsers(dest="suffer_cmd", required=True)
    psh = ps_sub.add_parser("harm", help="Endure Harm")
    psh.add_argument("--health", required=True, type=int)
    psh.add_argument("--iron", required=True, type=int)
    psh.add_argument("--harm", required=True, type=int)
    psh.add_argument("--momentum", required=True, type=int)
    psh.add_argument("--momentum-reset", type=int, default=2)
    psh.add_argument("--burn", action="store_true")
    psh.add_argument("--action-die", type=int, default=None)
    psh.add_argument("--challenge-dice", type=str, default=None)
    psh.set_defaults(func=cmd_suffer_harm)
    pss = ps_sub.add_parser("stress", help="Endure Stress")
    pss.add_argument("--spirit", required=True, type=int)
    pss.add_argument("--heart", required=True, type=int)
    pss.add_argument("--stress", required=True, type=int)
    pss.add_argument("--momentum", required=True, type=int)
    pss.add_argument("--momentum-reset", type=int, default=2)
    pss.add_argument("--burn", action="store_true")
    pss.add_argument("--action-die", type=int, default=None)
    pss.add_argument("--challenge-dice", type=str, default=None)
    pss.set_defaults(func=cmd_suffer_stress)

    pas = sub.add_parser("asset", help="Look up an asset card by id")
    pas.add_argument("id", type=str)
    pas.set_defaults(func=cmd_asset)

    pn = sub.add_parser("npc", help="Look up an NPC by id, with rank mapping")
    pn.add_argument("id", type=str)
    pn.set_defaults(func=cmd_npc)

    pt = sub.add_parser("truths", help="Look up a Your Truths category by id")
    pt.add_argument("id", type=str)
    pt.add_argument("--roll", type=int, default=None,
                    help="If provided, also return the option matched by this 1d100 roll")
    pt.set_defaults(func=cmd_truths)

    pl = sub.add_parser("list", help="List ids of a given type")
    pl.add_argument("type", type=str, choices=["moves", "oracles", "assets", "npcs", "truths"])
    pl.set_defaults(func=cmd_list)

    return p


def main(argv: list[str] | None = None) -> None:
    parser = make_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
