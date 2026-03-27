# OdznakaGO (Web) + GitHub Pages

Statyczna aplikacja frontendowa (HTML + JavaScript) publikowana przez GitHub Pages.

## Najważniejsze funkcjonalności

- Niezalogowany użytkownik:
  - przegląda punkty i odznaki (tryb tylko do odczytu),
  - korzysta z mapy jak dotychczas.
- Zalogowany użytkownik Google:
  - zapisuje i edytuje wizyty punktów (`id_punktu` = Google `place_id`),
  - dodaje i usuwa zdjęcia wizyt,
  - ma filtry mapy: wszystkie / odwiedzone / nieodwiedzone,
  - ma zapisywane preferencje (filtr + widok mapy) w Google Drive `appDataFolder`.

## Struktura (modułowa)

- `OdznakaGO/index.html` - główny plik startowy aplikacji
- `OdznakaGO/js/main.js` - orchestracja aplikacji
- `OdznakaGO/js/modules/*.js` - moduły runtime:
  - `data-loader.js` - ładowanie CSV/MD i budowa modelu punktów,
  - `map-view.js` - logika mapy i render markerów,
  - `google-auth.js` - logowanie Google OAuth,
  - `drive-api.js` - operacje na Google Drive API v3,
  - `visits-store.js` - model wizyt i preferencji,
  - `ui.js` - warstwa UI (lista, dialog wizyty, filtry),
  - `csv.js`, `geo.js`, `utils.js` - narzędzia pomocnicze.
- `zasoby/` - lokalne dane (CSV/MD) ładowane przez przeglądarkę

## Ściąga: gdzie edytować co

- Integracja danych odznak i punktów (CSV/MD):
  - `OdznakaGO/js/modules/data-loader.js`
- Parser CSV i narzędzia geograficzne (`place_id`, odległości):
  - `OdznakaGO/js/modules/csv.js`
  - `OdznakaGO/js/modules/geo.js`
- Widok mapy, markery i klastrowanie:
  - `OdznakaGO/js/modules/map-view.js`
- UI (filtry, popupy, dialog wizyty):
  - `OdznakaGO/js/modules/ui.js`
- Logowanie Google OAuth:
  - `OdznakaGO/js/modules/google-auth.js`
- Operacje plikowe na Google Drive `appDataFolder`:
  - `OdznakaGO/js/modules/drive-api.js`
- Logika domenowa wizyt i preferencji:
  - `OdznakaGO/js/modules/visits-store.js`
- Spinanie całej aplikacji i eventów globalnych:
  - `OdznakaGO/js/main.js`

## Wymagania

- Node.js + npm (do uruchomienia/zarządzania skryptami deploy)
- Google Cloud OAuth 2.0 Client ID (web) do logowania i zapisu danych użytkownika

## Konfiguracja Google OAuth

1. W Google Cloud Console utwórz lub wybierz projekt.
2. Włącz API:
   - `APIs & Services` -> `Library` -> `Google Drive API` -> `Enable`.
3. Skonfiguruj ekran zgody OAuth:
   - `APIs & Services` -> `OAuth consent screen`,
   - ustaw nazwę aplikacji i email kontaktowy,
   - jeśli aplikacja jest w trybie testowym, dodaj konta do `Test users`.
4. Utwórz OAuth 2.0 Client ID typu **Web application**:
   - `APIs & Services` -> `Credentials` -> `Create credentials` -> `OAuth client ID`.
5. Dodaj dozwolone `Authorized JavaScript origins` (minimum):
   - `http://127.0.0.1:4173`
   - `http://localhost:4173`
   - `https://<username>.github.io` (dla GitHub Pages)
6. Ustaw `client_id` w pliku `OdznakaGO/config.js`:
   - `window.ODZNAKAGO_GOOGLE_CLIENT_ID = '...';`
7. Aplikacja przy logowaniu poprosi o scope `drive.appdata`.
8. Aplikacja wykonuje automatyczną próbę cichego logowania (konto już zalogowane w przeglądarce). Jeśli to niemożliwe, użytkownik klika `Zaloguj Google` i przechodzi standardowy ekran zgody OAuth.
9. Bez ustawionego `CLIENT_ID` logowanie nie zadziała (to wymóg OAuth 2.0 dla aplikacji web).

### Szybka diagnostyka OAuth (najczęstsze problemy)

- Przycisk logowania nie działa / błąd inicjalizacji:
  - sprawdź, czy `window.ODZNAKAGO_GOOGLE_CLIENT_ID` jest ustawione w `OdznakaGO/config.js`.
- Błąd `origin_mismatch`:
  - dodaj dokładny origin (protokół + host + port) do `Authorized JavaScript origins`.
- Konto nie może się zalogować:
  - przy trybie testowym upewnij się, że konto jest dodane do `Test users`.
- Scope odrzucany:
  - sprawdź, czy na ekranie zgody scope `drive.appdata` jest poprawnie skonfigurowany.

### Bezpieczeństwo i publikacja

- `CLIENT_ID` można wersjonować (to publiczny identyfikator aplikacji).
- Nigdy nie commituj `CLIENT_SECRET` ani tokenów dostępowych.
- Dane użytkownika są odseparowane per konto Google: każdy użytkownik zapisuje pliki tylko we własnym `appDataFolder`.

Dlaczego `drive.appdata`:
- pozwala przechowywać prywatne dane wizyt użytkownika w ukrytym folderze aplikacji na jego Dysku Google,
- aplikacja nie potrzebuje dostępu do pozostałych plików użytkownika.

## Model danych wizyt (Google Drive appData)

- `wizyty.json`:
  - tablica obiektów: `id_punktu`, `data_wizyty`, `id_opis`, `id_zdjec`.
- `preferencje.json`:
  - `filter` (all/visited/notVisited),
  - `mapView` (`lat`, `lng`, `zoom`).
- folder `wizyty_opisy`:
  - pliki `<id_opis>.json` z treścią opisu wizyty, ładowane na żądanie.
- folder `wizyty_zdjecia`:
  - pliki zdjęć powiązanych z wizytą (`id_zdjec` to tablica identyfikatorów Drive).

## Uruchomienie lokalne

1. Instalacja zależności:
   - `npm ci`
2. (Opcjonalnie) development CSS Tailwind w trybie watch:
   - `npm run watch:css`
   - komenda nasłuchuje zmian i aktualizuje `OdznakaGO/tailwind.css`
3. Start hostingu:
   - `npm run start:local`
4. Otwórz w przeglądarce:
   - `http://localhost:4173/OdznakaGO/`

Skrypt `start:local` uruchamia `prepare:hosting`, które:

- buduje lokalny CSS Tailwind (`npm run build:css` -> `OdznakaGO/tailwind.css`),
- przygotowuje katalog `.deploy` (na podstawie `OdznakaGO/` i `zasoby/`).

Następnie startuje prosty serwer do podglądu offline.

## Deploy do GitHub Pages

Masz dwa warianty: automatyczny (workflow) lub ręczny (komenda lokalnie).

### Wariant A: automatyczny (workflow)

1. Upewnij się, że w repozytorium włączono GitHub Pages:
   - `Settings` -> `Pages`
   - `Source`: `Deploy from a branch`
   - `Branch`: `gh-pages`
   - `/(root)`
2. Workflow `.github/workflows/deploy-gh-pages.yml` publikuje aplikację na branch `gh-pages` po `push` na gałęzie `main` i `master`.
   - Workflow wykonuje `npm ci`, buduje artefakty hostingu (`npm run prepare:hosting`, w tym lokalny build Tailwinda) i sprawdza obecność `tailwind.css` w `.deploy/OdznakaGO/`.

Możesz też uruchomić ręcznie:
- `Actions` -> workflow „Deploy to GitHub Pages” -> `Run workflow`.

Po deploy:
- `https://<username>.github.io/<repo>/OdznakaGO/`

### Wariant B: ręczny (z komputera)

1. Instalacja zależności:
   - `npm ci`
2. Uruchom przygotowanie katalogu hostingu:
   - `npm run prepare:hosting`
3. Zdeployuj ręcznie, przekazując token w URL (żeby `git` nie pytał o `Username`):
   - PowerShell:
     - `$token="TWOJ_TOKEN"; $repo="OWNER/REPO"; npx gh-pages -d .deploy -r "https://x-access-token:$token@github.com/$repo.git"`
   - CMD:
     - `set token=TWOJ_TOKEN && set repo=OWNER/REPO && npx gh-pages -d .deploy -r "https://x-access-token:%token%@github.com/%repo%.git"`

Po deploy:
- `https://<username>.github.io/<repo>/OdznakaGO/`

## Jak działa deploy w praktyce?

Skrypt `scripts/prepare-hosting.mjs` tworzy katalog `.deploy`, który zawiera:

- `OdznakaGO/` (static web app)
- kopię `zasoby/` zarówno w:
  - `.deploy/zasoby/`
  - `.deploy/OdznakaGO/zasoby/`

Dzięki temu ścieżki względne używane w `OdznakaGO/app.js` działają poprawnie po publikacji.

## License

Kod jest licencjonowany na warunkach `LICENSE` (GNU AGPLv3).

