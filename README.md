# OdznakaGO (Web) + GitHub Pages

Statyczna aplikacja frontendowa (HTML + JavaScript) publikowana przez GitHub Pages.

## Struktura

- `OdznakaGO/index.html` - główny plik startowy aplikacji
- `OdznakaGO/*.js` - logika aplikacji
- `zasoby/` - lokalne dane (CSV/MD) ładowane przez przeglądarkę

## Wymagania

- Node.js + npm (do uruchomienia/zarządzania skryptami deploy)

## Uruchomienie lokalne

1. Instalacja zależności:
   - `npm ci`
2. Start hostingu:
   - `npm run start:local`
3. Otwórz w przeglądarce:
   - `http://localhost:4173/OdznakaGO/`

Skrypt `start:local` przygotowuje katalog `.deploy` (na podstawie `OdznakaGO/` i `zasoby/`), a następnie uruchamia prosty serwer do podglądu offline.

## Deploy do GitHub Pages

Masz dwa warianty: automatyczny (workflow) lub ręczny (komenda lokalnie).

### Wariant A: automatyczny (workflow)

1. Upewnij się, że w repozytorium włączono GitHub Pages:
   - `Settings` -> `Pages`
   - `Source`: `Deploy from a branch`
   - `Branch`: `gh-pages`
   - `/(root)`
2. Workflow `.github/workflows/deploy-gh-pages.yml` publikuje aplikację na branch `gh-pages` po `push` na gałęzie `main` i `master`.

Możesz też uruchomić ręcznie:
- `Actions` -> workflow „Deploy to GitHub Pages” -> `Run workflow`.

Po deploy:
- `https://<username>.github.io/<repo>/OdznakaGO/`

### Wariant B: ręczny (z komputera)

1. Instalacja zależności:
   - `npm ci`
2. Ustaw token GitHub (PAT) z prawem do zapisu na repozytorium:
   - PowerShell:
     - `$env:GH_TOKEN="TWOJ_TOKEN"; npm run deploy:gh-pages`
   - CMD:
     - `set GH_TOKEN=TWOJ_TOKEN && npm run deploy:gh-pages`
3. Uruchom deploy:
   - `npm run deploy:gh-pages`

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

