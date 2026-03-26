# Projekt: OdznakaGO (System Wspomagania Zdobywania Odznak Turystycznych)

## 1. Kontekst Projektu
- **Cel:** Aplikacja na Androida (APK) + wersja Web (PWA/Hobbyist Hosting) ułatwiająca logowanie wizyt, śledzenie postępów i generowanie dzienniczków odznak.
- **Główna funkcjonalność:** Interaktywna mapa z punktami, które mogą przypisać wizytę do wielu odznak jednocześnie.
- **Ograniczenia sprzętowe dewelopera:** Laptop 10-letni, 8GB RAM (wymagana optymalizacja procesów, unikanie emulatorów, praca w VS Code).

## 2. Architektura Danych (Zasoby Lokalne)
Dane są przechowywane w strukturze folderów `zasoby/odznaki/`:
- `indeks.csv`: Główny spis (kolumny: nazwa, url, plik_csv, plik_md).
- `*.csv`: Listy konkretnych obiektów dla danej odznaki (nazwa_obiektu, region, kategoria_obiektu, adres, maps_url, lokalizacja).
- `*.md`: Szczegółowe opisy wymagań i regulaminy odznak.
- `html/`: (Wygenerowane) Samodzielne pliki HTML z inlinowanymi grafikami (Base64) do podglądu offline.

## 3. Struktura Bazy Danych (SQLite / Relacyjna)
Kluczowe dla uniknięcia duplikatów i obsługi "punktu w wielu odznakach":
- **Table `badges`**: Metadane odznaki (z pliku .md).
- **Table `points`**: Unikalne lokalizacje (Deduplikacja po współrzędnych).
- **Table `badge_points`**: Tabela łącząca (N:M) – wiąże jeden punkt z wieloma odznakami.
- **Table `visits`**: Logi użytkownika (timestamp, point_id, photo_path, notes).

## 4. Funkcjonalności Krytyczne
### A. Silnik Reguł (Rule Engine)
- **Punkty Stałe:** GPS check-in (promień ~100m) dla obiektów z listy.
- **Reguły Ogólne:** Zadania typu "zrób zdjęcie tablicy rezerwatu" dla odznak bez listy punktów. Możliwość wyszukiwania takich obiektów przez Map API w pobliżu.

### B. Import i Ingest
- Skrypt parsujący CSV/MD przy starcie lub aktualizacji bazy.
- Automatyczne czyszczenie nazw plików (strip path/extension).

### C. Raportowanie (Dzienniczek)
- Eksport do **PDF** (format chronologiczny).
- Zawartość: Nazwa obiektu, data, współrzędne, potwierdzenie (zdjęcie/opis).

## 5. Wytyczne Techniczne (Technologie)
- **Język:** Dart
- **Framework:** Flutter (umożliwia kompilację do APK i Web z jednego kodu).
- **Mapy:** Flutter Map (OpenStreetMap) – lekkie dla RAM-u.
- **Lokalne Środowisko:** VS Code + Flutter SDK + Fizyczny telefon (bez emulatora).

## 6. Słownik i Formaty
- **Separator w CSV:** Średnik (`;`).
- **Standard współrzędnych:** Decimal Degrees (np. `50.12345, 19.54321`).