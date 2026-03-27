import { parseCSV } from './csv.js';
import { parseCoordinates, extractPlaceId } from './geo.js';

function resolveCsvPath(csvFile) {
    const normalized = String(csvFile).trim().replace(/\\/g, '/');
    if (normalized.startsWith('zasoby/')) return normalized;
    return `zasoby/odznaki/${normalized}`;
}

function resolveResourcePath(pathValue) {
    const normalized = String(pathValue || '').trim().replace(/\\/g, '/');
    if (!normalized) return '';
    if (normalized.startsWith('zasoby/')) return normalized;
    return `zasoby/odznaki/${normalized}`;
}

export async function loadBadgeData() {
    const badgeEntries = [];
    const pointsByPlaceId = new Map();
    const missingPlaceIdCsvFiles = new Set();

    const indexResponse = await fetch('zasoby/odznaki/indeks.csv');
    const indexText = await indexResponse.text();
    const badges = parseCSV(indexText).slice(1);
    badgeEntries.push(...badges.map((row) => ({
        name: String(row[0] || '').trim(),
        url: String(row[1] || '').trim(),
        category: String(row[2] || '').trim(),
        csvFile: String(row[3] || '').trim(),
        mdFile: String(row[4] || '').trim()
    })).filter((entry) => entry.name));

    for (const badge of badgeEntries) {
        const { name: badgeName, category, csvFile } = badge;
        if ((category !== 'A' && category !== 'B' && category !== 'D') || !csvFile) continue;
        const csvPath = resolveCsvPath(csvFile);
        const csvResponse = await fetch(csvPath);
        if (!csvResponse.ok) continue;
        const csvText = await csvResponse.text();
        const rows = parseCSV(csvText);
        const header = rows[0] || [];
        const normHeader = header.map((h) => String(h || '').replace(/^\ufeff/, '').trim());
        const headerIndex = new Map(normHeader.map((h, i) => [h, i]));

        const nameIdx = headerIndex.has('nazwa_obiektu') ? headerIndex.get('nazwa_obiektu') : 0;
        const addressIdx = headerIndex.has('adres') ? headerIndex.get('adres') : 3;
        const coordsIdx = headerIndex.has('lokalizacja')
            ? headerIndex.get('lokalizacja')
            : headerIndex.has('wspolrzedne') ? headerIndex.get('wspolrzedne') : -1;
        const mapsUrlIdx = headerIndex.has('maps_url') ? headerIndex.get('maps_url') : -1;

        for (const point of rows.slice(1)) {
            const name = String(point[nameIdx] || '').trim();
            const address = String(point[addressIdx] || '').trim();
            const coords = parseCoordinates(point[coordsIdx]);
            const placeId = extractPlaceId(point[mapsUrlIdx]);
            if (!name && !address) continue;
            if (!coords || !placeId) {
                if (!missingPlaceIdCsvFiles.has(csvPath)) {
                    missingPlaceIdCsvFiles.add(csvPath);
                    console.info(`Pominięto punkty bez GPS/place_id w ${csvPath}`);
                }
                continue;
            }

            if (!pointsByPlaceId.has(placeId)) {
                pointsByPlaceId.set(placeId, {
                    id: placeId,
                    name: name || 'Bez nazwy',
                    address,
                    coords,
                    badges: new Set()
                });
            }
            pointsByPlaceId.get(placeId).badges.add(badgeName);
        }
    }

    const allPoints = [...pointsByPlaceId.values()].map((p) => ({ ...p, badges: [...p.badges] }));
    return { badgeEntries, allPoints, resolveResourcePath };
}
