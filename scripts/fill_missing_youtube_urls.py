#!/usr/bin/env python3
"""Fill missing YouTube URLs in a CSV by searching YouTube per row.

Default query format:
    {game} OST - "{track}"

The script:
1. Reads a CSV file.
2. Finds rows where the target URL column is blank.
3. Opens YouTube search results in Chromium or Firefox via Playwright.
4. Captures the first video result URL.
5. Saves progress back to a CSV after each processed row.

Examples:
    python3 scripts/fill_missing_youtube_urls.py data/tracks.csv

    python3 scripts/fill_missing_youtube_urls.py data/tracks.csv \
      --game-column "Game Name" \
      --track-column "Track" \
      --url-column "URL" \
      --browser chromium \
      --browser-path /usr/bin/chromium \
      --profile-dir .cache/youtube-fill-profile \
      --headful
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qs, quote_plus, urlparse

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - dependency is optional at edit time
    sync_playwright = None
    PlaywrightTimeoutError = Exception


DEFAULT_QUERY_TEMPLATE = '{game} OST - "{track}"'
DEFAULT_EXCLUDED_TITLE_FRAGMENTS = [
    " extended",
    "(extended",
    "[extended",
    "full ost",
    "whole ost",
    "full soundtrack",
    "complete soundtrack",
]
DEFAULT_BROWSER_PATHS = {
    "chromium": [
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
    ],
    "firefox": [
        "/usr/bin/firefox",
    ],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fill missing YouTube URLs in a CSV using browser automation.",
    )
    parser.add_argument("csv_path", help="Path to the source CSV file.")
    parser.add_argument(
        "--output",
        help="Path to write the updated CSV. Defaults to overwriting the input file.",
    )
    parser.add_argument(
        "--game-column",
        default="Game Name",
        help='CSV column for the game title. Default: "Game Name".',
    )
    parser.add_argument(
        "--track-column",
        default="Track",
        help='CSV column for the track title. Default: "Track".',
    )
    parser.add_argument(
        "--url-column",
        default="URL",
        help='CSV column to fill with the YouTube URL. Default: "URL".',
    )
    parser.add_argument(
        "--status-column",
        default="youtube_fill_status",
        help='CSV column used to record fill status. Default: "youtube_fill_status".',
    )
    parser.add_argument(
        "--query-column",
        default="youtube_search_query",
        help='CSV column used to store the generated query. Default: "youtube_search_query".',
    )
    parser.add_argument(
        "--query-template",
        default=DEFAULT_QUERY_TEMPLATE,
        help=(
            "Search template using {game} and {track}. "
            f"Default: {DEFAULT_QUERY_TEMPLATE!r}."
        ),
    )
    parser.add_argument(
        "--exclude-title-fragment",
        action="append",
        default=None,
        help=(
            "Case-insensitive title fragment to reject in search results. "
            "Can be passed multiple times. "
            f"Default fragments: {DEFAULT_EXCLUDED_TITLE_FRAGMENTS!r}."
        ),
    )
    parser.add_argument(
        "--browser",
        choices=("chromium", "firefox"),
        default="chromium",
        help="Browser engine to use. Default: chromium.",
    )
    parser.add_argument(
        "--browser-path",
        help="Explicit browser executable path. If omitted, common system paths are tried.",
    )
    parser.add_argument(
        "--profile-dir",
        default=".cache/youtube-fill-profile",
        help=(
            "Persistent browser profile directory. "
            "Useful for cookies/consent pages. Default: .cache/youtube-fill-profile"
        ),
    )
    parser.add_argument(
        "--headful",
        action="store_true",
        help="Run with a visible browser window instead of headless mode.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.5,
        help="Delay in seconds between searches. Default: 1.5.",
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=15000,
        help="Per-search timeout in milliseconds. Default: 15000.",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=None,
        help="Process at most this many missing rows.",
    )
    parser.add_argument(
        "--start-row",
        type=int,
        default=1,
        help="1-based CSV data row number to start from. Default: 1.",
    )
    parser.add_argument(
        "--skip-status",
        action="store_true",
        help="Do not write status/query helper columns.",
    )
    return parser.parse_args()


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def resolve_browser_path(browser: str, explicit_path: str | None) -> str:
    if explicit_path:
        if os.path.exists(explicit_path):
            return explicit_path
        fail(f"Browser executable was not found: {explicit_path}")

    for candidate in DEFAULT_BROWSER_PATHS.get(browser, []):
        if os.path.exists(candidate):
            return candidate

    fail(
        f"Could not find a {browser} executable automatically. "
        "Pass --browser-path explicitly."
    )


def read_csv_rows(csv_path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            fail("CSV file has no header row.")
        rows = [dict(row) for row in reader]
        return list(reader.fieldnames), rows


def write_csv_rows(
    output_path: Path,
    fieldnames: list[str],
    rows: Iterable[dict[str, str]],
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def normalized_value(value: str | None) -> str:
    return (value or "").strip()


def build_search_query(
    row: dict[str, str],
    *,
    game_column: str,
    track_column: str,
    query_template: str,
) -> str:
    game = normalized_value(row.get(game_column))
    track = normalized_value(row.get(track_column))
    if not game or not track:
        return ""
    return query_template.format(game=game, track=track).strip()


def is_missing_url(row: dict[str, str], url_column: str) -> bool:
    return not normalized_value(row.get(url_column))


def search_youtube_first_video_url(
    page,
    query: str,
    timeout_ms: int,
    excluded_title_fragments: list[str],
) -> str | None:
    search_url = (
        "https://www.youtube.com/results?search_query=" + quote_plus(query)
    )
    page.goto(search_url, wait_until="domcontentloaded", timeout=timeout_ms)

    consent_buttons = [
        'button:has-text("Accept all")',
        'button:has-text("I agree")',
        'button:has-text("Accept the use of cookies")',
    ]
    for selector in consent_buttons:
        try:
            button = page.locator(selector).first
            button.wait_for(state="visible", timeout=1000)
            button.click()
            break
        except Exception:
            continue

    selectors = (
        "ytd-video-renderer a#video-title[href*='/watch?v=']",
        "a#video-title[href*='/watch?v=']",
    )

    for selector in selectors:
        try:
            locator = page.locator(selector)
            locator.first.wait_for(state="visible", timeout=timeout_ms)
        except PlaywrightTimeoutError:
            continue

        count = locator.count()
        for index in range(count):
            result_link = locator.nth(index)
            title_text = result_link.text_content() or ""
            if should_skip_result_title(title_text, excluded_title_fragments):
                continue

            href = result_link.get_attribute("href")
            normalized_url = normalize_youtube_video_url(href)
            if normalized_url:
                return normalized_url

    return None


def normalize_youtube_video_url(href: str | None) -> str | None:
    if not href:
        return None

    if href.startswith("http://") or href.startswith("https://"):
        absolute_url = href
    else:
        absolute_url = "https://www.youtube.com" + href

    parsed = urlparse(absolute_url)
    if "/playlist" in parsed.path:
        return None

    if parsed.path == "/watch":
        video_ids = parse_qs(parsed.query).get("v", [])
        if not video_ids:
            return None
        return f"https://youtu.be/{video_ids[0]}"

    if parsed.netloc.endswith("youtu.be") and parsed.path.strip("/"):
        return f"https://youtu.be/{parsed.path.strip('/')}"

    return None


def should_skip_result_title(title: str, excluded_title_fragments: list[str]) -> bool:
    normalized_title = normalized_value(title).casefold()
    if not normalized_title:
        return False

    return any(
        fragment and fragment in normalized_title
        for fragment in excluded_title_fragments
    )


def ensure_required_columns(fieldnames: list[str], args: argparse.Namespace) -> list[str]:
    missing = [
        name
        for name in (args.game_column, args.track_column, args.url_column)
        if name not in fieldnames
    ]
    if missing:
        fail(f"CSV is missing required columns: {', '.join(missing)}")

    next_fieldnames = list(fieldnames)
    if not args.skip_status:
        for extra_column in (args.query_column, args.status_column):
            if extra_column not in next_fieldnames:
                next_fieldnames.append(extra_column)
    return next_fieldnames


def main() -> int:
    args = parse_args()
    if sync_playwright is None:
        fail(
            "playwright is not installed. Run: python3 -m pip install playwright"
        )

    csv_path = Path(args.csv_path).expanduser().resolve()
    if not csv_path.exists():
        fail(f"CSV file was not found: {csv_path}")

    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else csv_path
    )
    browser_path = resolve_browser_path(args.browser, args.browser_path)
    fieldnames, rows = read_csv_rows(csv_path)
    fieldnames = ensure_required_columns(fieldnames, args)

    profile_dir = Path(args.profile_dir).expanduser().resolve()
    excluded_title_fragments = [
        fragment.casefold()
        for fragment in (
            args.exclude_title_fragment
            if args.exclude_title_fragment is not None
            else DEFAULT_EXCLUDED_TITLE_FRAGMENTS
        )
        if normalized_value(fragment)
    ]
    processed = 0
    found = 0
    skipped = 0
    failed = 0

    with sync_playwright() as playwright:
        browser_type = getattr(playwright, args.browser)
        context = browser_type.launch_persistent_context(
            user_data_dir=str(profile_dir),
            executable_path=browser_path,
            headless=not args.headful,
            viewport={"width": 1440, "height": 1024},
        )
        try:
            page = context.pages[0] if context.pages else context.new_page()

            for index, row in enumerate(rows, start=1):
                if index < args.start_row:
                    continue

                if not is_missing_url(row, args.url_column):
                    skipped += 1
                    continue

                query = build_search_query(
                    row,
                    game_column=args.game_column,
                    track_column=args.track_column,
                    query_template=args.query_template,
                )
                if not query:
                    if not args.skip_status:
                        row[args.query_column] = ""
                        row[args.status_column] = "missing-game-or-track"
                    failed += 1
                    write_csv_rows(output_path, fieldnames, rows)
                    continue

                try:
                    url = search_youtube_first_video_url(
                        page,
                        query,
                        args.timeout_ms,
                        excluded_title_fragments,
                    )
                    if url:
                        row[args.url_column] = url
                        if not args.skip_status:
                            row[args.query_column] = query
                            row[args.status_column] = "found"
                        found += 1
                    else:
                        if not args.skip_status:
                            row[args.query_column] = query
                            row[args.status_column] = "no-video-result"
                        failed += 1
                except Exception as exc:  # pragma: no cover - browser/runtime failures
                    if not args.skip_status:
                        row[args.query_column] = query
                        row[args.status_column] = f"error: {exc}"
                    failed += 1

                processed += 1
                write_csv_rows(output_path, fieldnames, rows)

                print(
                    f"[{processed}] row={index} found={found} failed={failed} "
                    f"skipped={skipped} query={query!r}",
                    flush=True,
                )

                if args.max_rows is not None and processed >= args.max_rows:
                    break

                if args.delay > 0:
                    time.sleep(args.delay)
        finally:
            context.close()

    print(
        f"done: processed={processed} found={found} failed={failed} skipped={skipped} "
        f"output={output_path}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
