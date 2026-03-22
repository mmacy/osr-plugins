#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "html-to-markdown",
# ]
# ///
"""Fetch and cache Old-School Essentials SRD pages as Markdown.

Usage:
  fetch_srd.py <slug> [<slug> ...]

Examples:
  fetch_srd.py Creating_a_Character
  fetch_srd.py Ability_Scores
  fetch_srd.py Weapons_and_Armour

This script caches fetched pages under:
  .claude/skills/ose-character/.cache/srd/

Pass --refresh to re-download a page even if present in the cache.
"""

import argparse
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_BASE_URL = "https://oldschoolessentials.necroticgnome.com/srd/index.php/"


def _default_cache_dir() -> Path:
    return Path(__file__).resolve().parent / "references" / "srd"


def _slug_from_arg(arg: str, base_url: str) -> str:
    if arg.startswith("http://") or arg.startswith("https://"):
        parsed = urllib.parse.urlparse(arg)
        # Accept both absolute and site-relative SRD URLs.
        if parsed.path.endswith("/index.php/") or parsed.path.endswith("/index.php"):
            # https://.../index.php/<slug> is unusual but handle gracefully
            return parsed.path.rsplit("/index.php", 1)[-1].lstrip("/")
        if "/index.php/" in parsed.path:
            return parsed.path.split("/index.php/", 1)[1]
        # If it looks like a full URL but not an index.php URL, treat whole thing as slug-ish.
        return arg.removeprefix(base_url)
    return arg


def _cache_path(cache_dir: Path, slug: str) -> Path:
    safe = urllib.parse.quote(slug, safe="")
    return cache_dir / f"{safe}.md"


def _read_file(path: Path) -> bytes:
    return path.read_bytes()


def _find_ca_bundle() -> str | None:
    env_path = os.environ.get("SSL_CERT_FILE")
    if env_path and Path(env_path).exists():
        return env_path

    verify_paths = ssl.get_default_verify_paths()
    candidates = [
        verify_paths.cafile,
        verify_paths.openssl_cafile,
        "/etc/ssl/cert.pem",  # macOS system bundle
        "/etc/pki/tls/certs/ca-bundle.crt",  # RHEL/CentOS/Fedora
        "/etc/ssl/certs/ca-certificates.crt",  # Debian/Ubuntu
    ]
    for candidate in candidates:
        if not candidate:
            continue
        if Path(candidate).exists():
            return candidate
    return None


def _fetch_url(url: str, timeout_s: int) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ose-character-fetch_srd/1.0",
            "Accept": "text/html,*/*;q=0.8",
        },
    )
    ca_bundle = _find_ca_bundle()
    context = ssl.create_default_context(cafile=ca_bundle) if ca_bundle else None
    with urllib.request.urlopen(request, timeout=timeout_s, context=context) as response:
        return response.read()


def fetch_srd(
    slug: str,
    *,
    base_url: str,
    cache_dir: Path,
    refresh: bool,
    timeout_s: int,
) -> bytes:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = _cache_path(cache_dir, slug)

    if cache_path.exists() and not refresh:
        return _read_file(cache_path)

    url = urllib.parse.urljoin(base_url, slug)
    html_bytes = _fetch_url(url, timeout_s)

    html_text = html_bytes.decode("utf-8", errors="replace")
    # Extract main content from MediaWiki page to skip nav/sidebar/footer chrome.
    start = re.search(r'<div class="mw-parser-output">', html_text)
    end = re.search(r'<div class="printfooter">', html_text)
    if start and end:
        html_text = html_text[start.end() : end.start()]

    from html_to_markdown import convert

    md_text = convert(html_text)
    data = md_text.encode("utf-8")

    tmp_path = cache_path.with_suffix(cache_path.suffix + ".tmp")
    tmp_path.write_bytes(data)
    tmp_path.replace(cache_path)
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch and cache OSE SRD pages.")
    parser.add_argument("slug", nargs="+", help="SRD page slug (e.g., Ability_Scores)")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Base SRD URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--cache-dir",
        default=str(_default_cache_dir()),
        help="Cache directory (default: alongside this script under .cache/srd/)",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Re-download even if a cached file exists.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="Network timeout in seconds (default: 30).",
    )
    args = parser.parse_args()

    base_url = args.base_url
    if not base_url.endswith("/"):
        base_url += "/"

    cache_dir = Path(args.cache_dir)

    first = True
    for raw in args.slug:
        slug = _slug_from_arg(raw, base_url).strip()
        if not slug:
            print(f"error: invalid slug argument: {raw!r}", file=sys.stderr)
            return 2

        data = fetch_srd(
            slug,
            base_url=base_url,
            cache_dir=cache_dir,
            refresh=args.refresh,
            timeout_s=args.timeout,
        )

        if not first:
            sys.stdout.buffer.write(b"\n")
        first = False
        sys.stdout.buffer.write(data)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
