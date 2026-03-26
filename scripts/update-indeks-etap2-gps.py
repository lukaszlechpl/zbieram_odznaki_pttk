from __future__ import annotations

import argparse
import csv
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class IndexColumns:
    plik_csv_idx: int
    plik_md_idx: int
    status_idx: int


GPS_COORD_RE = re.compile(
    r"^\s*(?:gps\s*[;: ]*\s*)?"
    r"(?P<lat>-?\d+(?:\.\d+)?)\s*[;,]\s*(?P<lon>-?\d+(?:\.\d+)?)\s*$",
    re.IGNORECASE,
)


def _norm_rel_path(p: str) -> str:
    # Normalizacja na styl "zasoby/odznaki/xxx.md"
    return p.strip().replace("\\", "/")


def _read_index_columns(header: list[str]) -> IndexColumns:
    def idx(name: str) -> int:
        try:
            return header.index(name)
        except ValueError as e:
            raise RuntimeError(f"Brak kolumny `{name}` w indeksie.") from e

    return IndexColumns(
        plik_csv_idx=idx("plik_csv"),
        plik_md_idx=idx("plik_md"),
        status_idx=idx("status_przetwarzania"),
    )


def _csv_has_gps_coords(csv_path: Path) -> bool:
    """
    Sprawdza, czy w pliku CSV istnieje co najmniej jeden wiersz,
    w którym kolumna `lokalizacja` zawiera współrzędne GPS.
    """
    try:
        with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.reader(f, delimiter=";")

            try:
                header = next(reader)
            except StopIteration:
                return False

            header = [h.strip() for h in header]
            if "lokalizacja" in header:
                lokalizacja_idx = header.index("lokalizacja")
            else:
                # Awaryjnie: traktujemy ostatnią niepustą kolumnę jako `lokalizacja`
                lokalizacja_idx = None

            for row in reader:
                if not row:
                    continue
                if row and str(row[0]).lstrip().startswith("#"):
                    continue

                loc_raw: str
                if lokalizacja_idx is not None and lokalizacja_idx < len(row):
                    loc_raw = row[lokalizacja_idx]
                else:
                    # Znajdź ostatnie niepuste pole (niektóre wiersze mają trailing ';')
                    loc_raw = ""
                    for v in reversed(row):
                        if str(v).strip() != "":
                            loc_raw = str(v)
                            break

                loc = str(loc_raw).strip()
                if not loc or loc.upper() == "NOT_FOUND":
                    continue

                if GPS_COORD_RE.match(loc):
                    return True
    except FileNotFoundError:
        return False

    return False


def _load_index(indeks_csv: Path) -> tuple[list[str], list[list[str]], IndexColumns]:
    with indeks_csv.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        rows = list(reader)
    if not rows:
        raise RuntimeError("indeks.csv jest pusty.")

    header = rows[0]
    cols = _read_index_columns(header)
    return header, rows, cols


def _find_index_row_by_md(rows: list[list[str]], md_idx: int, md_filename: str) -> Optional[int]:
    """
    Szuka wiersza po `plik_md`.
    Najpierw próba po dokładnej nazwie pliku (końcówka ścieżki), potem bez ścisłego dopasowania.
    """
    for i in range(1, len(rows)):
        if md_idx >= len(rows[i]):
            continue
        val = _norm_rel_path(rows[i][md_idx] or "")
        if not val:
            continue

        if val.endswith(f"/{md_filename}") or val == f"{md_filename}":
            return i
    return None


def _write_index(indeks_csv: Path, header: list[str], rows: list[list[str]]) -> None:
    with indeks_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, delimiter=";", lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(header)
        for row in rows[1:]:
            writer.writerow(row)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Aktualizuje zasoby/odznaki/indeks.csv dla plików CSV z danymi GPS (ETAP2_OK)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Nie zapisuje indeksu, tylko wypisuje co byłoby zaktualizowane.",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    odznaki_dir = repo_root / "zasoby" / "odznaki"
    indeks_csv = odznaki_dir / "indeks.csv"

    if not indeks_csv.exists():
        raise FileNotFoundError(f"Nie znaleziono pliku: {indeks_csv}")

    header, rows, cols = _load_index(indeks_csv)

    csv_files = sorted(p for p in odznaki_dir.glob("*.csv") if p.name != "indeks.csv")

    updated = 0
    skipped_no_md = 0
    skipped_no_gps = 0
    skipped_missing_idx = 0

    for csv_path in csv_files:
        csv_filename = csv_path.name
        csv_stem = csv_path.stem
        md_filename = f"{csv_stem}.md"
        md_path = odznaki_dir / md_filename

        if not md_path.exists():
            skipped_no_md += 1
            continue

        if not _csv_has_gps_coords(csv_path):
            skipped_no_gps += 1
            continue

        idx_row = _find_index_row_by_md(rows, cols.plik_md_idx, md_filename)
        if idx_row is None:
            skipped_missing_idx += 1
            continue

        # Zapisujemy ścieżki względne (tak jak w indeksie).
        rel_csv_path = _norm_rel_path(f"zasoby/odznaki/{csv_filename}")

        # Uzupełnienie pól.
        row = rows[idx_row]
        while len(row) <= max(cols.plik_csv_idx, cols.status_idx):
            row.append("")

        row[cols.plik_csv_idx] = rel_csv_path
        row[cols.status_idx] = "ETAP2_OK"
        updated += 1

        print(f"OK: {csv_filename} -> {md_filename} (ETAP2_OK)")

    print(
        "Podsumowanie: "
        f"updated={updated}, skipped_no_md={skipped_no_md}, skipped_no_gps={skipped_no_gps}, "
        f"skipped_missing_idx={skipped_missing_idx}"
    )

    if updated == 0:
        return 0
    if args.dry_run:
        return 0

    _write_index(indeks_csv, header, rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

