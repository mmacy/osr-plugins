#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["ruamel.yaml>=0.18", "pytest>=7"]
# ///
"""Tests for iron.py.

Run directly: `uv run plugins/ironsworn-referee/skills/referee/scripts/test_iron.py`
Or with pytest: `uv run --with pytest --with ruamel.yaml pytest <path>/test_iron.py -v`

All randomness-using tests inject dice via the test-only args
(--action-die, --challenge-dice, --oracle-roll) so the suite is deterministic.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import iron  # noqa: E402

SCRIPT = Path(__file__).resolve().parent / "iron.py"


def run_cli(*args: str) -> dict:
    """Run iron.py with args, return parsed JSON. Raises if exit != 0 unless explicit."""
    result = subprocess.run(
        ["uv", "run", "--quiet", str(SCRIPT), *args],
        capture_output=True, text=True, check=False,
    )
    if not result.stdout:
        pytest.fail(f"no stdout. stderr:\n{result.stderr}")
    return json.loads(result.stdout)


# --- action_roll: hit math, caps, cancellation, burn, matches ---

def test_strong_hit():
    r = iron.action_roll(value=3, adds=1, momentum=2, momentum_reset=2,
                         action_die=5, challenge_dice=[4, 8])
    assert r["action_score"] == 9
    assert r["hit"] == "strong"
    assert r["match"] is False


def test_weak_hit():
    r = iron.action_roll(value=3, momentum=2, action_die=5, challenge_dice=[4, 9])
    assert r["hit"] == "weak"  # 8 > 4 only


def test_miss():
    r = iron.action_roll(value=1, momentum=2, action_die=2, challenge_dice=[7, 9])
    assert r["hit"] == "miss"


def test_action_score_capped_at_10():
    """Rulebook p. 8: action score never exceeds 10, even with high stat+adds+die."""
    r = iron.action_roll(value=5, adds=4, momentum=2, action_die=6, challenge_dice=[3, 3])
    assert r["raw_action_score"] == 15
    assert r["action_score"] == 10
    assert r["capped"] is True


def test_negative_momentum_cancels_matching_action_die():
    """Rulebook p. 13: when momentum<0 and equals the action die, the die is cancelled."""
    r = iron.action_roll(value=3, momentum=-3, action_die=3, challenge_dice=[2, 4])
    assert r["action_die_cancelled"] is True
    assert r["action_score"] == 3  # value+adds only, die suppressed
    assert r["hit"] == "weak"


def test_negative_momentum_no_cancel_when_die_differs():
    r = iron.action_roll(value=3, momentum=-3, action_die=4, challenge_dice=[2, 4])
    assert r["action_die_cancelled"] is False


def test_burn_upgrades_hit():
    """Burning replaces action score with current momentum."""
    r = iron.action_roll(value=0, momentum=8, momentum_reset=2, burn=True,
                         action_die=1, challenge_dice=[5, 7])
    assert r["burned"] is True
    assert r["action_score"] == 8
    assert r["hit"] == "strong"
    assert r["momentum_after_burn"] == 2


def test_burn_available_flagged_without_burning():
    r = iron.action_roll(value=2, momentum=9, action_die=1, challenge_dice=[6, 8])
    # action_score=3, miss vs 6,8 — burning to 9 would be strong
    assert r["hit"] == "miss"
    assert r["momentum_burn_available"] is True


def test_burn_reset_with_two_debilities():
    """Reset is 0 with 2+ debilities."""
    r = iron.action_roll(value=0, momentum=8, momentum_reset=0, burn=True,
                         action_die=1, challenge_dice=[5, 7])
    assert r["momentum_after_burn"] == 0


def test_matched_challenge_dice_flagged():
    r = iron.action_roll(value=3, momentum=2, action_die=5, challenge_dice=[7, 7])
    assert r["match"] is True
    assert r["match_value"] == 7


def test_matched_tens_flagged():
    """Rulebook p. 10: matched 10s — harrowing turn of events."""
    r = iron.action_roll(value=3, momentum=2, action_die=5, challenge_dice=[10, 10])
    assert r["match"] is True
    assert r["match_value"] == 10


# --- yesno: rulebook-correct roll >= 11/26/51/76/91 ---

def test_yesno_almost_certain_roll_11_yes_with_match():
    r = run_cli("oracle", "yesno", "--odds", "almost_certain", "--oracle-roll", "11")
    assert r["yes"] is True
    assert r["match"] is True
    assert r["threshold"] == 11


def test_yesno_almost_certain_roll_10_no():
    r = run_cli("oracle", "yesno", "--odds", "almost_certain", "--oracle-roll", "10")
    assert r["yes"] is False


def test_yesno_likely_roll_26_yes():
    r = run_cli("oracle", "yesno", "--odds", "likely", "--oracle-roll", "26")
    assert r["yes"] is True


def test_yesno_likely_roll_25_no():
    r = run_cli("oracle", "yesno", "--odds", "likely", "--oracle-roll", "25")
    assert r["yes"] is False


def test_yesno_50_50():
    assert run_cli("oracle", "yesno", "--odds", "50_50", "--oracle-roll", "51")["yes"] is True
    assert run_cli("oracle", "yesno", "--odds", "50_50", "--oracle-roll", "50")["yes"] is False


def test_yesno_unlikely():
    assert run_cli("oracle", "yesno", "--odds", "unlikely", "--oracle-roll", "76")["yes"] is True
    assert run_cli("oracle", "yesno", "--odds", "unlikely", "--oracle-roll", "75")["yes"] is False


def test_yesno_small_chance():
    assert run_cli("oracle", "yesno", "--odds", "small_chance", "--oracle-roll", "91")["yes"] is True
    assert run_cli("oracle", "yesno", "--odds", "small_chance", "--oracle-roll", "90")["yes"] is False


def test_yesno_match_doubles():
    """Doubles 11, 22, …, 99, plus 100 trigger a match independent of yes/no."""
    for doubled in (11, 22, 33, 44, 55, 66, 77, 88, 99):
        r = run_cli("oracle", "yesno", "--odds", "50_50", "--oracle-roll", str(doubled))
        assert r["match"] is True, f"roll {doubled} should match"
    r = run_cli("oracle", "yesno", "--odds", "50_50", "--oracle-roll", "100")
    assert r["match"] is True
    # non-double should not match
    r = run_cli("oracle", "yesno", "--odds", "50_50", "--oracle-roll", "12")
    assert r["match"] is False


def test_yesno_unknown_odds_returns_structured_error():
    result = subprocess.run(
        ["uv", "run", "--quiet", str(SCRIPT), "oracle", "yesno", "--odds", "maybe"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0


# --- embedded oracles indexed correctly ---

def test_pay_the_price_indexed():
    r = run_cli("list", "oracles")
    assert "classic/fate/pay_the_price/pay_the_price" in r["ids"]


def test_endure_harm_oracle_indexed():
    r = run_cli("list", "oracles")
    assert "classic/suffer/endure_harm/endure_harm" in r["ids"]


def test_endure_stress_oracle_indexed():
    r = run_cli("list", "oracles")
    assert "classic/suffer/endure_stress/endure_stress" in r["ids"]


def test_pay_the_price_row_99_recursion():
    """Row 99-100 = 'Roll twice more on this table. Both results occur.'"""
    r = run_cli("oracle", "table", "classic/fate/pay_the_price/pay_the_price",
                "--oracle-roll", "99")
    assert "subrolls" in r
    assert len(r["subrolls"]) == 2
    for sub in r["subrolls"]:
        assert sub["id"] == "classic/fate/pay_the_price/pay_the_price"
        assert "text" in sub


def test_pay_the_price_row_1_no_auto_recursion():
    """Row 1-2 text describes manual re-roll but has no oracle_rolls directive."""
    r = run_cli("oracle", "table", "classic/fate/pay_the_price/pay_the_price",
                "--oracle-roll", "1")
    assert "Roll again" in r["text"]
    assert "subrolls" not in r


def test_endure_harm_oracle_roll_5():
    """Rulebook p. 91: row 1-10 = 'The harm is mortal. Face Death.'"""
    r = run_cli("oracle", "table", "classic/suffer/endure_harm/endure_harm",
                "--oracle-roll", "5")
    assert "Face Death" in r["text"] or "mortal" in r["text"].lower()


def test_endure_stress_oracle_roll_5():
    r = run_cli("oracle", "table", "classic/suffer/endure_stress/endure_stress",
                "--oracle-roll", "5")
    assert r["text"]


# --- progress: ticks per rank + bonds + roll ---

@pytest.mark.parametrize("rank,expected_ticks", [
    ("troublesome", 12),
    ("dangerous", 8),
    ("formidable", 4),
    ("extreme", 2),
    ("epic", 1),
])
def test_progress_mark_ranks(rank, expected_ticks):
    r = run_cli("progress", "mark", "--rank", rank)
    assert r["ticks"] == expected_ticks


def test_progress_bond_always_one_tick():
    r = run_cli("progress", "bond")
    assert r["ticks"] == 1


def test_progress_roll_uses_boxes_not_ticks():
    """ticks=16 = 4 boxes; vs 3,7 = score 4 beats 3 only = weak."""
    r = run_cli("progress", "roll", "--ticks", "16", "--challenge-dice", "3,7")
    assert r["boxes_filled"] == 4
    assert r["hit"] == "weak"


def test_progress_roll_full_track_strong():
    """ticks=40 = 10 boxes; vs 5,9 = score 10 beats both = strong."""
    r = run_cli("progress", "roll", "--ticks", "40", "--challenge-dice", "5,9")
    assert r["boxes_filled"] == 10
    assert r["hit"] == "strong"


def test_progress_roll_partial_box_floors():
    """ticks=11 = 2 full boxes (8 ticks) + 3 leftover ticks; score=2."""
    r = run_cli("progress", "roll", "--ticks", "11", "--challenge-dice", "1,5")
    assert r["boxes_filled"] == 2


# --- momentum bounds derived from debilities (rulebook p. 13) ---

@pytest.mark.parametrize("deb,exp_max,exp_reset", [
    (0, 10, 2),
    (1, 9, 1),
    (2, 8, 0),
    (3, 7, 0),
    (4, 6, 0),
])
def test_momentum_bounds(deb, exp_max, exp_reset):
    r = run_cli("momentum", "bounds", "--debilities", str(deb))
    assert r["max"] == exp_max
    assert r["reset"] == exp_reset


# --- suffer harm: state mutation BEFORE roll, max-of-two, pending_choice ---

def test_suffer_harm_spill_to_momentum():
    """3 health, 5 harm: health -> 0, 2 spills to momentum."""
    r = run_cli("suffer", "harm", "--health", "3", "--iron", "2",
                "--harm", "5", "--momentum", "4",
                "--action-die", "3", "--challenge-dice", "5,9")
    assert r["state_after_damage"]["health"] == 0
    assert r["state_after_damage"]["momentum"] == 2
    assert r["state_after_damage"]["spill_to_momentum"] == 2


def test_suffer_harm_no_spill_when_health_absorbs_all():
    r = run_cli("suffer", "harm", "--health", "5", "--iron", "2",
                "--harm", "2", "--momentum", "4",
                "--action-die", "3", "--challenge-dice", "5,9")
    assert r["state_after_damage"]["health"] == 3
    assert r["state_after_damage"]["momentum"] == 4
    assert r["state_after_damage"]["spill_to_momentum"] == 0


def test_suffer_harm_picks_max_health_or_iron():
    """new_health 4 > iron 2 → roll +health."""
    r = run_cli("suffer", "harm", "--health", "5", "--iron", "2",
                "--harm", "1", "--momentum", "4",
                "--action-die", "3", "--challenge-dice", "5,9")
    assert r["roll_label"] == "health"
    assert r["roll_value"] == 4


def test_suffer_harm_picks_iron_when_health_lower():
    """new_health 0 < iron 2 → roll +iron."""
    r = run_cli("suffer", "harm", "--health", "1", "--iron", "2",
                "--harm", "1", "--momentum", "4",
                "--action-die", "3", "--challenge-dice", "5,9")
    assert r["roll_label"] == "iron"
    assert r["roll_value"] == 2


def test_suffer_harm_miss_at_zero_surfaces_pending_choice():
    """Miss at 0 health → pending_choice (mark debility OR roll fate table)."""
    r = run_cli("suffer", "harm", "--health", "1", "--iron", "1",
                "--harm", "1", "--momentum", "0",
                "--action-die", "1", "--challenge-dice", "9,10")
    assert r["state_after_damage"]["health"] == 0
    assert r["roll"]["hit"] == "miss"
    assert r["pending_choice"] == "mark_debility_or_roll_fate_table"
    assert r["fate_table_id"] == "classic/suffer/endure_harm/endure_harm"


def test_suffer_harm_miss_with_health_remaining_no_pending_choice():
    r = run_cli("suffer", "harm", "--health", "5", "--iron", "1",
                "--harm", "1", "--momentum", "0",
                "--action-die", "1", "--challenge-dice", "9,10")
    assert r["state_after_damage"]["health"] == 4
    assert r["pending_choice"] is None


# --- suffer stress mirrors suffer harm ---

def test_suffer_stress_spill_and_max():
    r = run_cli("suffer", "stress", "--spirit", "2", "--heart", "3",
                "--stress", "4", "--momentum", "4",
                "--action-die", "3", "--challenge-dice", "5,9")
    assert r["state_after_damage"]["spirit"] == 0
    assert r["state_after_damage"]["spill_to_momentum"] == 2
    assert r["roll_label"] == "heart"  # heart (3) > new_spirit (0)


def test_suffer_stress_miss_at_zero_pending_choice():
    r = run_cli("suffer", "stress", "--spirit", "1", "--heart", "1",
                "--stress", "1", "--momentum", "0",
                "--action-die", "1", "--challenge-dice", "9,10")
    assert r["state_after_damage"]["spirit"] == 0
    assert r["pending_choice"] == "mark_debility_or_roll_fate_table"
    assert r["fate_table_id"] == "classic/suffer/endure_stress/endure_stress"


# --- NPC: harm_inflicted vs progress_ticks_per_strike (two distinct fields) ---

def test_npc_rank_2_dangerous():
    r = run_cli("npc", "warrior")
    assert r["rank"] == 2
    assert r["rank_label"] == "dangerous"
    assert r["harm_inflicted"] == 2
    assert r["progress_ticks_per_strike"] == 8


def test_npc_unknown_id_structured_error():
    result = subprocess.run(
        ["uv", "run", "--quiet", str(SCRIPT), "npc", "nonexistent_creature"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0
    payload = json.loads(result.stdout)
    assert payload["error"]["code"] == "not_found"


# --- structural integrity ---

def test_move_count_matches_rulebook():
    """35 moves total across the 6 categories."""
    r = run_cli("list", "moves")
    assert r["count"] == 35


def test_schema_version_in_every_response():
    for cmd in [
        ["list", "moves"],
        ["progress", "bond"],
        ["momentum", "bounds", "--debilities", "0"],
        ["oracle", "yesno", "--odds", "50_50", "--oracle-roll", "50"],
    ]:
        assert run_cli(*cmd)["schema_version"] == 1


def test_filter_metadata_strips_internal_fields():
    r = run_cli("move", "face_danger")
    assert "_source" not in r["move"]
    assert "_id" not in r["move"]


def test_truths_with_roll_picks_matching_option():
    """Iron truth: 1-33 / 34-67 / 68-100. Roll 50 falls in 34-67."""
    r = run_cli("truths", "iron", "--roll", "50")
    assert r["chosen"] is not None
    assert "bleak" in r["chosen"]["description"].lower()


# --- invalid input handling ---

def test_unknown_move_id_structured_error():
    result = subprocess.run(
        ["uv", "run", "--quiet", str(SCRIPT), "move", "nope_not_a_move"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0
    payload = json.loads(result.stdout)
    assert payload["error"]["code"] == "not_found"


def test_unknown_oracle_id_structured_error():
    result = subprocess.run(
        ["uv", "run", "--quiet", str(SCRIPT), "oracle", "table", "bogus/id"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0
    payload = json.loads(result.stdout)
    assert payload["error"]["code"] == "not_found"


def test_bad_challenge_dice_format():
    result = subprocess.run(
        ["uv", "run", "--quiet", str(SCRIPT), "action", "--value", "3",
         "--momentum", "2", "--challenge-dice", "notanumber"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0


def test_negative_debilities_rejected():
    result = subprocess.run(
        ["uv", "run", "--quiet", str(SCRIPT), "momentum", "bounds",
         "--debilities", "-1"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0


def test_ticks_out_of_range_rejected():
    result = subprocess.run(
        ["uv", "run", "--quiet", str(SCRIPT), "progress", "roll",
         "--ticks", "100"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
