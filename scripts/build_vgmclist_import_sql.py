#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HTTP_URL_RE = re.compile(r"^https?://", re.IGNORECASE)
YOUTUBE_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build an idempotent SQL import file from tmp/vgmclist_with_retirees.csv."
        )
    )
    parser.add_argument(
        "--input-csv",
        default="tmp/vgmclist_with_retirees.csv",
        help="Source CSV file. Default: %(default)s",
    )
    parser.add_argument(
        "--output-sql",
        default="tmp/vgmclist_import.sql",
        help="Generated SQL file. Default: %(default)s",
    )
    parser.add_argument(
        "--skipped-csv",
        default="tmp/vgmclist_import_skipped.csv",
        help="Report of rows skipped for missing/invalid YouTube ids. Default: %(default)s",
    )
    return parser.parse_args()


def sql_text(value: str | None) -> str:
    if value is None:
        return "null"

    normalized = value.strip()
    if normalized == "":
        return "null"

    return "'" + normalized.replace("'", "''") + "'"


def sql_int(value: str | None) -> str:
    if value is None:
        return "null"

    normalized = value.strip()
    if normalized == "":
        return "null"

    return str(int(normalized))


def sql_bool(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    return "true" if normalized in {"true", "t", "1", "yes", "y"} else "false"


def extract_video_id(url: str) -> str | None:
    normalized = (url or "").strip()
    if not normalized:
        return None

    if YOUTUBE_VIDEO_ID_RE.fullmatch(normalized):
        return normalized

    parsed = urlparse(normalized)
    if parsed.netloc.endswith("youtu.be"):
        candidate = parsed.path.strip("/").split("/")[0]
        return candidate if YOUTUBE_VIDEO_ID_RE.fullmatch(candidate) else None

    if "youtube.com" in parsed.netloc:
        query_video_id = parse_qs(parsed.query).get("v", [None])[0]
        if query_video_id and YOUTUBE_VIDEO_ID_RE.fullmatch(query_video_id):
            return query_video_id

        path_parts = [part for part in parsed.path.split("/") if part]
        if len(path_parts) >= 2 and path_parts[0] in {"embed", "shorts"}:
            candidate = path_parts[1]
            return candidate if YOUTUBE_VIDEO_ID_RE.fullmatch(candidate) else None

    return None


def canonical_youtube_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def normalize_submitted_url(url: str, video_id: str) -> str:
    normalized = (url or "").strip()
    if normalized and HTTP_URL_RE.match(normalized):
        return normalized

    return canonical_youtube_url(video_id)


def main() -> int:
    args = parse_args()
    input_csv = Path(args.input_csv)
    output_sql = Path(args.output_sql)
    skipped_csv = Path(args.skipped_csv)

    if not input_csv.exists():
        raise SystemExit(f"Input CSV not found: {input_csv}")

    skipped_rows: list[tuple[int, str, str, str]] = []
    sql_lines = [
        "begin;",
        "",
    ]

    with input_csv.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)

        for line_number, row in enumerate(reader, start=2):
            contest_number = (row.get("") or row.get("VGMC") or "").strip()
            game = (row.get("Game") or "").strip()
            track = (row.get("Track") or "").strip()
            url = (row.get("URL") or "").strip()
            retired = row.get("Retired")
            retiree_contest = row.get("Retiree Contest")
            retiree_placement = row.get("Retiree Placement")
            highest_round = row.get("Round") or row.get("Highest Round")

            video_id = extract_video_id(url)
            if not video_id:
                skipped_rows.append((line_number, contest_number, game, track))
                continue

            submitted_url = normalize_submitted_url(url, video_id)

            sql_lines.append(
                "select public.import_vgmc_catalog_row("
                + ", ".join(
                    [
                        sql_int(contest_number),
                        sql_text(game),
                        sql_text(track),
                        sql_text(video_id),
                        sql_text(submitted_url),
                        sql_bool(retired),
                        sql_int(retiree_contest),
                        sql_int(retiree_placement),
                        sql_text(highest_round),
                    ]
                )
                + ");"
            )

    sql_lines.extend(["", "commit;", ""])

    output_sql.parent.mkdir(parents=True, exist_ok=True)
    output_sql.write_text("\n".join(sql_lines), encoding="utf-8")

    skipped_csv.parent.mkdir(parents=True, exist_ok=True)
    with skipped_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["line_number", "vgmc", "game", "track"])
        for line_number, contest_number, game, track in skipped_rows:
            writer.writerow([line_number, contest_number, game, track])

    print(f"Generated SQL: {output_sql}")
    print(f"Skipped-row report: {skipped_csv}")
    print(f"Skipped rows without a valid YouTube video id: {len(skipped_rows)}")
    if skipped_rows:
        preview = skipped_rows[:10]
        for line_number, contest_number, game, track in preview:
            print(
                f"  line {line_number}: VGMC {contest_number or '?'} | {game} | {track}"
            )
        if len(skipped_rows) > len(preview):
            print(f"  ... and {len(skipped_rows) - len(preview)} more")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
