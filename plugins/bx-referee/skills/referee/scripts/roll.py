#!/usr/bin/env python3
"""Dice rolling utility for OSE character creation."""

import random
import sys


def show_help():
    """Display usage information."""
    print("Usage: roll.py <dice_expression> [dice_expression ...]")
    print()
    print("Multiple expressions can be passed as separate args or comma-separated.")
    print()
    print("Examples:")
    print("  roll.py 3d6                        # Roll 3d6, sum the results")
    print("  roll.py 3d6x6                      # Roll 3d6 six times (ability scores)")
    print("  roll.py 4d6Lx6                     # Roll 4d6 drop lowest, six times")
    print('  roll.py "3d6*10"                   # Roll 3d6, multiply by 10 (starting gold)')
    print("  roll.py 1d20+1                     # Roll 1d20 with +1 modifier")
    print("  roll.py 1d8-2                      # Roll 1d8 with -2 modifier")
    print('  roll.py 1d4 1d4 1d6 1d6+1 2d6      # Multiple separate expressions')
    print('  roll.py "1d4,1d4,1d6,1d6+1,2d6"   # Comma-separated expressions')
    print()
    print("Notation:")
    print("  NdM      - Roll N dice of size M")
    print("  L        - Drop the lowest die (e.g., 4d6L)")
    print("  +X/-X    - Add/subtract modifier (e.g., 1d20+1)")
    print("  xN       - Repeat N times (e.g., 3d6x6)")
    print('  *N       - Multiply result by N (e.g., "3d6*10" - quote required)')
    print()
    print("Note: Quote expressions containing * to prevent shell expansion.")


def roll_dice(num_dice: int, die_size: int, drop_lowest: bool = False) -> list[int]:
    """Roll dice and optionally drop the lowest result.

    Args:
        num_dice: Number of dice to roll
        die_size: Size of each die (e.g., 6 for d6)
        drop_lowest: Whether to drop the lowest roll

    Returns:
        List of rolled values (after dropping lowest if specified)
    """
    rolls = [random.randint(1, die_size) for _ in range(num_dice)]
    if drop_lowest and len(rolls) > 1:
        rolls_sorted = sorted(rolls)
        return rolls_sorted[1:]
    return rolls


def eval_dice_expr(expr: str) -> list[int]:
    """Evaluate a single dice expression and return results.

    Args:
        expr: A dice expression like "3d6", "4d6L", "1d6+1", "3d6x6", or "3d6*10".

    Returns:
        List of integer results (one per repetition).
    """
    # Parse multiplier (e.g., "3d6*10")
    multiplier = 1
    if "*" in expr:
        expr, mult_str = expr.split("*")
        multiplier = int(mult_str)

    # Parse repetitions (e.g., "3d6x6")
    repetitions = 1
    if "x" in expr:
        expr, rep_str = expr.split("x")
        repetitions = int(rep_str)

    # Parse modifier (e.g., "1d20+1" or "1d8-2")
    modifier = 0
    if "+" in expr:
        expr, mod_str = expr.split("+")
        modifier = int(mod_str)
    elif "-" in expr:
        expr, mod_str = expr.split("-")
        modifier = -int(mod_str)

    # Parse drop lowest (e.g., "4d6L")
    drop_lowest = False
    if expr.endswith("L"):
        drop_lowest = True
        expr = expr[:-1]

    # Parse dice notation (e.g., "3d6")
    num_dice, die_size = map(int, expr.split("d"))

    results = []
    for _ in range(repetitions):
        rolls = roll_dice(num_dice, die_size, drop_lowest)
        total = (sum(rolls) + modifier) * multiplier
        results.append(total)
    return results


def main():
    """Parse command-line args and roll dice."""
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        show_help()
        sys.exit(0)

    # Collect expressions: support separate args and/or comma-separated
    expressions = []
    for arg in sys.argv[1:]:
        expressions.extend(arg.split(","))

    all_outputs = []
    for expr in expressions:
        expr = expr.strip()
        if not expr:
            continue
        results = eval_dice_expr(expr)
        if len(results) == 1:
            all_outputs.append(str(results[0]))
        else:
            all_outputs.append(str(results))

    if len(all_outputs) == 1:
        print(all_outputs[0])
    else:
        print(" ".join(all_outputs))


if __name__ == "__main__":
    main()
