#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path

from bs4 import BeautifulSoup


@dataclass(frozen=True)
class CsvRow:
    line_number: int
    contest: str
    game: str
    track: str
    url: str
    normalized_game: str
    normalized_track: str
    alias_game: str
    alias_track: str


@dataclass(frozen=True)
class RetireeRow:
    game: str
    song: str
    contest: str
    placement_raw: str
    placement_number: str
    normalized_game: str
    normalized_track: str
    alias_game: str
    alias_track: str


@dataclass(frozen=True)
class MatchCandidate:
    csv_row: CsvRow
    score: float
    track_score: float
    game_score: float


@dataclass(frozen=True)
class ResolvedMatch:
    retiree: RetireeRow
    csv_rows: tuple[CsvRow, ...]
    method: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Append retiree contest/placement data from the retirees HTML page "
            "to the VGMC nomination CSV."
        )
    )
    parser.add_argument(
        "--input-csv",
        default="tmp/vgmclist.csv",
        help="Source nomination CSV. Default: %(default)s",
    )
    parser.add_argument(
        "--retirees-html",
        default="tmp/retirees.html",
        help="Local retirees HTML file. Default: %(default)s",
    )
    parser.add_argument(
        "--output-csv",
        default="tmp/vgmclist_with_retirees.csv",
        help="Merged output CSV. Default: %(default)s",
    )
    parser.add_argument(
        "--review-csv",
        default="tmp/vgmclist_retirees_review.csv",
        help="Review CSV for unmatched or uncertain retirees. Default: %(default)s",
    )
    return parser.parse_args()


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text or "")
    normalized = "".join(
        ch for ch in normalized if not unicodedata.combining(ch)
    ).lower()
    normalized = normalized.replace("&", " and ").replace("’", "'").replace("†", "")
    normalized = normalized.replace("int’l", "international").replace("int'l", "international")
    normalized = re.sub(r"\bver\.?\b", " version ", normalized)
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def alias_game(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("’", "'")
    text = re.sub(r":.*$", "", text)
    text = re.sub(r"~.*$", "", text)
    text = re.sub(r"\(.*?\)", "", text)
    return normalize_text(text)


def alias_track(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("’", "'")
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\bversion\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bver\.?\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\blap\s*\d+\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\btheme of\b", " ", text, flags=re.IGNORECASE)
    return normalize_text(text)


def parse_placement_number(placement_raw: str) -> str:
    match = re.match(r"(\d+)", placement_raw.strip())
    return match.group(1) if match else ""


def load_csv_rows(path: Path) -> tuple[list[str], list[list[str]], list[CsvRow]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.reader(handle)
        header = next(reader)
        raw_rows: list[list[str]] = []
        parsed_rows: list[CsvRow] = []

        for line_number, row in enumerate(reader, start=2):
            if not row:
                continue

            padded = (row + ["", "", "", ""])[:4]
            contest, game, track, url = [item.strip() for item in padded]
            raw_rows.append([contest, game, track, url])
            parsed_rows.append(
                CsvRow(
                    line_number=line_number,
                    contest=contest,
                    game=game,
                    track=track,
                    url=url,
                    normalized_game=normalize_text(game),
                    normalized_track=normalize_text(track),
                    alias_game=alias_game(game),
                    alias_track=alias_track(track),
                )
            )

    return header, raw_rows, parsed_rows


def load_retirees(path: Path) -> list[RetireeRow]:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")
    retirees: list[RetireeRow] = []

    for tr in soup.select("table tbody tr"):
        tds = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
        if len(tds) != 5:
            continue

        _, game, song, contest_label, placement_raw = tds
        contest_match = re.search(r"VGMC\s+(\d+)", contest_label)
        if not contest_match:
            continue

        contest = contest_match.group(1)
        retirees.append(
            RetireeRow(
                game=game,
                song=song,
                contest=contest,
                placement_raw=placement_raw,
                placement_number=parse_placement_number(placement_raw),
                normalized_game=normalize_text(game),
                normalized_track=normalize_text(song),
                alias_game=alias_game(game),
                alias_track=alias_track(song),
            )
        )

    return retirees


def build_indexes(csv_rows: list[CsvRow]) -> dict[str, defaultdict[tuple[str, ...], list[CsvRow]]]:
    indexes = {
        "exact": defaultdict(list),
        "alias": defaultdict(list),
        "track": defaultdict(list),
        "track_alias": defaultdict(list),
        "contest": defaultdict(list),
    }

    for row in csv_rows:
        indexes["exact"][(row.contest, row.normalized_game, row.normalized_track)].append(row)
        indexes["alias"][(row.contest, row.alias_game, row.alias_track)].append(row)
        indexes["track"][(row.contest, row.normalized_track)].append(row)
        indexes["track_alias"][(row.contest, row.alias_track)].append(row)
        indexes["contest"][row.contest].append(row)

    return indexes


def rows_are_duplicateish(rows: list[CsvRow]) -> bool:
    if not rows:
        return False
    return len({(row.track, row.url) for row in rows}) == 1


def fuzzy_candidates(retiree: RetireeRow, contest_rows: list[CsvRow]) -> list[MatchCandidate]:
    candidates: list[MatchCandidate] = []

    for row in contest_rows:
        track_score = SequenceMatcher(None, retiree.alias_track, row.alias_track).ratio()
        game_score = max(
            SequenceMatcher(None, retiree.normalized_game, row.normalized_game).ratio(),
            SequenceMatcher(None, retiree.alias_game, row.alias_game).ratio(),
        )
        score = (track_score * 0.8) + (game_score * 0.2)
        candidates.append(
            MatchCandidate(
                csv_row=row,
                score=score,
                track_score=track_score,
                game_score=game_score,
            )
        )

    candidates.sort(key=lambda item: item.score, reverse=True)
    return candidates


def accept_fuzzy_match(
    candidates: list[MatchCandidate],
) -> tuple[tuple[CsvRow, ...], str] | None:
    if not candidates:
        return None

    best = candidates[0]
    second = candidates[1] if len(candidates) > 1 else None
    gap = best.score - second.score if second else 1.0

    if best.score >= 0.92 and best.track_score >= 0.90 and gap >= 0.05:
        return (best.csv_row,), "fuzzy_high"

    if (
        best.score >= 0.86
        and best.track_score >= 0.96
        and best.game_score >= 0.45
        and gap >= 0.07
    ):
        return (best.csv_row,), "fuzzy_track_dominant"

    if (
        best.score >= 0.82
        and best.track_score >= 0.80
        and best.game_score >= 0.75
        and gap >= 0.12
    ):
        return (best.csv_row,), "fuzzy_balanced"

    return None


def resolve_retiree(
    retiree: RetireeRow,
    indexes: dict[str, defaultdict[tuple[str, ...], list[CsvRow]]],
) -> tuple[ResolvedMatch | None, list[MatchCandidate]]:
    exact = indexes["exact"][(retiree.contest, retiree.normalized_game, retiree.normalized_track)]
    if len(exact) == 1:
        return ResolvedMatch(retiree, (exact[0],), "exact"), []
    if len(exact) > 1 and rows_are_duplicateish(exact):
        return ResolvedMatch(retiree, tuple(exact), "exact_duplicate"), []

    alias = indexes["alias"][(retiree.contest, retiree.alias_game, retiree.alias_track)]
    if len(alias) == 1:
        return ResolvedMatch(retiree, (alias[0],), "alias_exact"), []
    if len(alias) > 1 and rows_are_duplicateish(alias):
        return ResolvedMatch(retiree, tuple(alias), "alias_duplicate"), []

    track = indexes["track"][(retiree.contest, retiree.normalized_track)]
    if len(track) == 1:
        return ResolvedMatch(retiree, (track[0],), "contest_track_unique"), []
    if len(track) > 1 and rows_are_duplicateish(track):
        return ResolvedMatch(retiree, tuple(track), "contest_track_duplicate"), []

    track_alias = indexes["track_alias"][(retiree.contest, retiree.alias_track)]
    if len(track_alias) == 1:
        return ResolvedMatch(retiree, (track_alias[0],), "contest_track_alias_unique"), []
    if len(track_alias) > 1 and rows_are_duplicateish(track_alias):
        return ResolvedMatch(retiree, tuple(track_alias), "contest_track_alias_duplicate"), []

    candidates = fuzzy_candidates(retiree, indexes["contest"][retiree.contest])
    fuzzy = accept_fuzzy_match(candidates)
    if fuzzy is not None:
        csv_rows, method = fuzzy
        return ResolvedMatch(retiree, csv_rows, method), candidates[:3]

    return None, candidates[:3]


def write_output(
    header: list[str],
    raw_rows: list[list[str]],
    parsed_rows: list[CsvRow],
    resolved_matches: list[ResolvedMatch],
    output_csv: Path,
) -> int:
    row_updates: dict[int, dict[str, str]] = {}

    for match in resolved_matches:
        for row in match.csv_rows:
            row_updates[row.line_number] = {
                "retired": "true",
                "retiree_contest": match.retiree.contest,
                "retiree_placement": match.retiree.placement_number,
                "retiree_placement_raw": match.retiree.placement_raw,
                "retiree_match_method": match.method,
            }

    merged_header = header + [
        "Retired",
        "Retiree Contest",
        "Retiree Placement",
        "Retiree Placement Raw",
        "Retiree Match Method",
    ]

    written = 0
    with output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(merged_header)

        for raw_row, parsed_row in zip(raw_rows, parsed_rows):
            update = row_updates.get(parsed_row.line_number, {})
            writer.writerow(
                raw_row
                + [
                    update.get("retired", ""),
                    update.get("retiree_contest", ""),
                    update.get("retiree_placement", ""),
                    update.get("retiree_placement_raw", ""),
                    update.get("retiree_match_method", ""),
                ]
            )
            written += 1

    return written


def write_review(
    review_csv: Path,
    unresolved: list[tuple[RetireeRow, list[MatchCandidate]]],
) -> None:
    with review_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "retiree_contest",
                "retiree_game",
                "retiree_song",
                "retiree_placement",
                "suggested_csv_line_1",
                "suggested_csv_game_1",
                "suggested_csv_track_1",
                "suggested_score_1",
                "suggested_csv_line_2",
                "suggested_csv_game_2",
                "suggested_csv_track_2",
                "suggested_score_2",
                "suggested_csv_line_3",
                "suggested_csv_game_3",
                "suggested_csv_track_3",
                "suggested_score_3",
            ]
        )

        for retiree, candidates in unresolved:
            row = [
                retiree.contest,
                retiree.game,
                retiree.song,
                retiree.placement_raw,
            ]

            for candidate in candidates[:3]:
                row.extend(
                    [
                        str(candidate.csv_row.line_number),
                        candidate.csv_row.game,
                        candidate.csv_row.track,
                        f"{candidate.score:.3f}",
                    ]
                )

            while len(row) < 16:
                row.append("")

            writer.writerow(row)


def main() -> int:
    args = parse_args()
    input_csv = Path(args.input_csv)
    retirees_html = Path(args.retirees_html)
    output_csv = Path(args.output_csv)
    review_csv = Path(args.review_csv)

    if not input_csv.exists():
        print(f"Input CSV not found: {input_csv}", file=sys.stderr)
        return 1

    if not retirees_html.exists():
        print(f"Retirees HTML not found: {retirees_html}", file=sys.stderr)
        return 1

    header, raw_rows, parsed_rows = load_csv_rows(input_csv)
    retirees = load_retirees(retirees_html)
    indexes = build_indexes(parsed_rows)

    resolved_matches: list[ResolvedMatch] = []
    unresolved: list[tuple[RetireeRow, list[MatchCandidate]]] = []

    for retiree in retirees:
        resolved, candidates = resolve_retiree(retiree, indexes)
        if resolved is not None:
            resolved_matches.append(resolved)
        else:
            unresolved.append((retiree, candidates))

    written_rows = write_output(header, raw_rows, parsed_rows, resolved_matches, output_csv)
    write_review(review_csv, unresolved)

    matched_csv_rows = sum(len(match.csv_rows) for match in resolved_matches)

    print(f"Retirees parsed: {len(retirees)}")
    print(f"Resolved retirees: {len(resolved_matches)}")
    print(f"CSV rows annotated as retired: {matched_csv_rows}")
    print(f"Rows written: {written_rows}")
    print(f"Unresolved retirees for review: {len(unresolved)}")
    print(f"Merged CSV: {output_csv}")
    print(f"Review CSV: {review_csv}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
