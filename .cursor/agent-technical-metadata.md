# OdznakaGO - metadane techniczne agenta

## Runtime i architektura

- Frontend statyczny (HTML + JS ES Modules), wejście: `OdznakaGO/index.html`.
- Główny orchestrator: `OdznakaGO/js/main.js`.
- Moduły runtime w `OdznakaGO/js/modules/`:
  - `data-loader.js`, `map-view.js`, `ui.js`,
  - `google-auth.js`, `drive-api.js`, `visits-store.js`,
  - `csv.js`, `geo.js`, `utils.js`.

## Jak dobierać moduły do zadania (bez ładowania całości)

- Zawsze startuj od najwęższego zakresu:
  - najpierw odpowiedni moduł w `OdznakaGO/js/modules/`,
  - potem dopiero `OdznakaGO/js/main.js`, jeśli potrzebny jest przepływ między modułami.
- Nie czytaj całego `main.js`, jeśli zadanie dotyczy pojedynczej funkcji modułu.
- Ładuj tylko moduły powiązane z typem zadania:
  - Dane CSV / budowa punktów: `data-loader.js`, pomocniczo `csv.js`, `geo.js`.
  - Mapa, markery, klastrowanie, geolokalizacja: `map-view.js`, pomocniczo `geo.js`.
  - UI listy odznak, popupy, dialog wizyty, filtry: `ui.js`.
  - Logowanie Google OAuth: `google-auth.js`.
  - Operacje Google Drive API: `drive-api.js`.
  - Reguły domenowe wizyt i preferencji: `visits-store.js`.
  - Narzędzia wspólne: `utils.js`.
- Jeśli zadanie obejmuje tylko jeden obszar (np. upload zdjęcia), nie ładuj modułów niepowiązanych (np. parsera CSV).
- Dopiero przy refaktorze przekrojowym lub błędzie integracyjnym czytaj kilka modułów naraz.

## Szybka mapa odpowiedzialności

- `main.js`: orkiestracja i wiązanie eventów między modułami.
- `data-loader.js`: źródła danych odznak/punktów.
- `map-view.js`: rendering mapy i markerów.
- `ui.js`: komponenty i zachowanie interfejsu.
- `google-auth.js`: sesja użytkownika Google.
- `drive-api.js`: transport i pliki w `appDataFolder`.
- `visits-store.js`: model `wizyty.json` i `preferencje.json`.

## Integracje zewnętrzne

- Google Identity Services (`https://accounts.google.com/gsi/client`) do OAuth.
- Google Drive API v3 (REST) dla:
  - `appDataFolder` (`wizyty.json`, `preferencje.json`),
  - katalogów `wizyty_opisy` i `wizyty_zdjecia`.

## Kluczowe założenia danych

- Unikalny klucz punktu: `id_punktu = Google place_id` (parsowany z `maps_url`).
- Wizyta:
  - `id_punktu`,
  - `data_wizyty` (ISO),
  - `id_opis` (ID opisu),
  - `id_zdjec` (tablica ID plików zdjęć).

## Zachowanie trybów użytkownika

- Gość: tylko podgląd punktów i odznak.
- Zalogowany:
  - edycja wizyt (data, opis),
  - upload/usuwanie zdjęć,
  - filtry mapy i preferencje zapisywane na Drive.
