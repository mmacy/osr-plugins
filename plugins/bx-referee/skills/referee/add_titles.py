#!/usr/bin/env python3
"""Add H1 titles to SRD reference files that don't already have one.

Derives the title from the filename by URL-decoding and replacing underscores with spaces.
"""

import urllib.parse
from pathlib import Path


def filename_to_title(filename: str) -> str:
    """Convert a URL-encoded filename like 'Cure_Light_Wounds_%28Cause_Lt._Wounds%29.md' to a title."""
    stem = filename.removesuffix(".md")
    # Double-encoded percent signs (e.g., %25C3 from quote(quote(...)))
    # need multiple decode passes
    decoded = stem
    for _ in range(3):
        prev = decoded
        decoded = urllib.parse.unquote(decoded)
        if decoded == prev:
            break
    return decoded.replace("_", " ")


def add_title_to_file(path: Path) -> bool:
    """Add an H1 title to a file if it doesn't already start with one. Returns True if modified."""
    content = path.read_text(encoding="utf-8")
    if content.startswith("# "):
        return False

    title = filename_to_title(path.name)
    new_content = f"# {title}\n\n{content}"
    path.write_text(new_content, encoding="utf-8")
    return True


def main() -> int:
    srd_dir = Path(__file__).resolve().parent / "references" / "srd"
    if not srd_dir.exists():
        print(f"error: {srd_dir} does not exist", flush=True)
        return 1

    modified = 0
    skipped = 0
    for md_file in sorted(srd_dir.glob("*.md")):
        if add_title_to_file(md_file):
            modified += 1
        else:
            skipped += 1

    print(f"Added titles to {modified} files, skipped {skipped} (already had H1)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
