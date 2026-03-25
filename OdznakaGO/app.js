document.addEventListener('DOMContentLoaded', () => {
    const MAX_VISIBLE_POINTS = 100;
    const GEOCODE_MAX_REQUESTS = 10;
    const GEOCODE_WINDOW_MS = 5 * 60 * 1000;
    const map = L.map('map').setView([52.237, 19.145], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const displayLayer = L.layerGroup().addTo(map);
    const pointsByCoord = new Map();
    const geocodeCache = loadGeocodeCache();
    const geocodeRequestTimestamps = [];
    const badgeEntries = [];

    const mapContainer = document.getElementById('map');
    const badgeView = document.getElementById('badge-view');
    const badgeSource = document.getElementById('badge-source');
    const badgeContent = document.getElementById('badge-content');
    const showMapBtn = document.getElementById('show-map-btn');
    const badgeListToggle = document.getElementById('badge-list-toggle');
    const badgeList = document.getElementById('badge-list');

    showMapBtn.addEventListener('click', showMapView);
    badgeListToggle.addEventListener('click', toggleBadgeList);

    async function loadBadges() {
        try {
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
            renderBadgeList();

            for (const badge of badgeEntries) {
                const { name: badgeName, category, csvFile } = badge;
                if ((category === 'A' || category === 'B') && csvFile) {
                    const csvPath = resolveCsvPath(csvFile);
                    const csvResponse = await fetch(csvPath);
                    if (!csvResponse.ok) continue;
                    const csvText = await csvResponse.text();
                    const points = parseCSV(csvText).slice(1);

                    for (const point of points) {
                        const [name, , , address, coordsRaw] = point;
                        if (!name && !address) continue;

                        let coords = parseCoordinates(coordsRaw);
                        if (!coords && canRunGeocodeFallback()) {
                            coords = await geocodePoint(name, address);
                        }
                        if (!coords) continue;

                        const coordKey = `${coords[0].toFixed(5)},${coords[1].toFixed(5)}`;
                        if (!pointsByCoord.has(coordKey)) {
                            pointsByCoord.set(coordKey, {
                                name: String(name || '').trim() || 'Bez nazwy',
                                address: String(address || '').trim(),
                                coords,
                                badges: new Set()
                            });
                        }
                        pointsByCoord.get(coordKey).badges.add(badgeName);
                    }
                }
            }

            const normalizedPoints = [...pointsByCoord.values()].map((p) => ({
                ...p,
                badges: [...p.badges]
            }));
            renderPoints(normalizedPoints);
            showMapView();
        } catch (error) {
            console.error("Błąd podczas ładowania danych odznak:", error);
        }
    }

    function renderBadgeList() {
        badgeList.innerHTML = '';
        for (const badge of badgeEntries) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'badge-link';
            item.textContent = badge.name;
            item.addEventListener('click', () => showBadgePage(badge));
            badgeList.appendChild(item);
        }
    }

    function showMapView() {
        badgeView.style.display = 'none';
        mapContainer.style.display = 'block';
        badgeSource.innerHTML = '';
        setTimeout(() => map.invalidateSize(), 0);
    }

    async function showBadgePage(badge) {
        mapContainer.style.display = 'none';
        badgeView.style.display = 'flex';
        badgeContent.innerHTML = `<h1>${escapeHtml(badge.name)}</h1><p>Ładowanie treści odznaki...</p>`;

        const externalUrl = badge.url;
        const mdPath = resolveResourcePath(badge.mdFile);

        if (externalUrl) {
            badgeSource.textContent = 'Źródło: ';
            const link = document.createElement('a');
            link.href = externalUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = externalUrl;
            badgeSource.appendChild(link);
        } else {
            badgeSource.textContent = 'Brak linku źródłowego dla tej odznaki.';
        }

        if (!mdPath) {
            badgeContent.innerHTML = `<h1>${escapeHtml(badge.name)}</h1><p>Brak lokalnego pliku opisu (plik_md) dla tej odznaki.</p>`;
            return;
        }

        try {
            const response = await fetch(mdPath);
            if (!response.ok) {
                badgeContent.innerHTML = `<h1>${escapeHtml(badge.name)}</h1><p>Nie udało się wczytać lokalnego opisu: <code>${escapeHtml(mdPath)}</code>.</p>`;
                return;
            }
            const markdown = await response.text();
            badgeContent.innerHTML = marked.parse(markdown || `# ${badge.name}\n\nBrak treści opisu.`);
        } catch {
            badgeContent.innerHTML = `<h1>${escapeHtml(badge.name)}</h1><p>Błąd podczas ładowania lokalnego opisu odznaki.</p>`;
        }
    }

    function toggleBadgeList() {
        const isHidden = badgeList.style.display === 'none';
        badgeList.style.display = isHidden ? 'block' : 'none';
        badgeListToggle.textContent = isHidden ? 'lista odznak' : 'lista odznak (ukryta)';
    }

    function resolveCsvPath(csvFile) {
        const normalized = String(csvFile).trim().replace(/\\/g, '/');
        if (normalized.startsWith('zasoby/')) {
            return normalized;
        }
        return `zasoby/odznaki/${normalized}`;
    }

    function resolveResourcePath(pathValue) {
        const normalized = String(pathValue || '').trim().replace(/\\/g, '/');
        if (!normalized) return '';
        if (normalized.startsWith('zasoby/')) return normalized;
        return `zasoby/odznaki/${normalized}`;
    }

    function parseCoordinates(value) {
        const raw = String(value || '').trim();
        if (!raw) return null;

        const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
        if (!match) return null;

        let first = Number(match[1]);
        let second = Number(match[2]);
        if (Number.isNaN(first) || Number.isNaN(second)) return null;

        // Dane źródłowe zwykle mają zapis "lon, lat"
        let lat = second;
        let lon = first;
        if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
            lat = first;
            lon = second;
        }
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
        return [lat, lon];
    }

    async function geocodePoint(name, address) {
        const query = [name, address, 'Polska'].filter(Boolean).join(', ');
        const cacheKey = query.toLowerCase();
        if (geocodeCache[cacheKey]) return geocodeCache[cacheKey];

        try {
            markGeocodeFallbackCall();
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) return null;
            const result = await response.json();
            if (!Array.isArray(result) || result.length === 0) return null;
            const lat = Number(result[0].lat);
            const lon = Number(result[0].lon);
            if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
            const coords = [lat, lon];
            geocodeCache[cacheKey] = coords;
            saveGeocodeCache(geocodeCache);
            return coords;
        } catch {
            return null;
        }
    }

    function canRunGeocodeFallback() {
        const now = Date.now();
        while (geocodeRequestTimestamps.length > 0 && now - geocodeRequestTimestamps[0] > GEOCODE_WINDOW_MS) {
            geocodeRequestTimestamps.shift();
        }
        return geocodeRequestTimestamps.length < GEOCODE_MAX_REQUESTS;
    }

    function markGeocodeFallbackCall() {
        const now = Date.now();
        geocodeRequestTimestamps.push(now);
    }

    function renderPoints(points) {
        displayLayer.clearLayers();
        if (!points.length) return;

        if (points.length <= MAX_VISIBLE_POINTS) {
            points.forEach((point) => displayLayer.addLayer(createPointMarker(point)));
            return;
        }

        const groups = groupNearestPoints(points, MAX_VISIBLE_POINTS);
        groups.forEach((group) => {
            if (group.points.length === 1) {
                displayLayer.addLayer(createPointMarker(group.points[0]));
            } else {
                displayLayer.addLayer(createGroupMarker(group));
            }
        });
    }

    function groupNearestPoints(points, maxGroups) {
        let cellSize = 0.03;
        let grouped = [];

        for (let i = 0; i < 14; i += 1) {
            const buckets = new Map();
            for (const point of points) {
                const [lat, lon] = point.coords;
                const key = `${Math.floor(lat / cellSize)}:${Math.floor(lon / cellSize)}`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(point);
            }
            grouped = [...buckets.values()];
            if (grouped.length <= maxGroups) break;
            cellSize *= 1.4;
        }

        return grouped.map((bucket) => {
            const center = bucket.reduce((acc, point) => {
                acc[0] += point.coords[0];
                acc[1] += point.coords[1];
                return acc;
            }, [0, 0]).map((sum) => sum / bucket.length);
            return { center, points: bucket };
        });
    }

    function createPointMarker(point) {
        const [lat, lon] = point.coords;
        const marker = L.marker([lat, lon]);
        const popupContent = `
            <b>${escapeHtml(point.name)}</b><br>
            ${escapeHtml(point.address || '')}<br><br>
            <b>Ten punkt zalicza się do odznak:</b>
            <ul>${point.badges.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
        `;
        marker.bindPopup(popupContent);
        return marker;
    }

    function createGroupMarker(group) {
        const [lat, lon] = group.center;
        const marker = L.marker([lat, lon], {
            icon: L.divIcon({
                className: 'custom-group-marker',
                html: `<div style="background:#2563eb;color:#fff;border-radius:999px;min-width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff;">${group.points.length}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            })
        });
        const listItems = group.points
            .map((point) => `<li><b>${escapeHtml(point.name)}</b><br>${escapeHtml(point.address || 'Brak adresu')}<br><small>${escapeHtml(point.badges.join(', '))}</small></li>`)
            .join('');
        marker.bindPopup(`<b>Grupa ${group.points.length} punktów</b><ul style="max-height:250px;overflow:auto;padding-left:18px;">${listItems}</ul>`);
        return marker;
    }

    function parseCSV(text) {
        const lines = String(text || '').replace(/\r/g, '').split('\n').filter(Boolean);
        return lines.map((line) => {
            const columns = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i += 1) {
                const char = line[i];
                if (char === '"') {
                    const next = line[i + 1];
                    if (inQuotes && next === '"') {
                        current += '"';
                        i += 1;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ';' && !inQuotes) {
                    columns.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            columns.push(current);
            return columns.map((value) => value.trim());
        });
    }

    function loadGeocodeCache() {
        try {
            return JSON.parse(localStorage.getItem('odznakago-geocode-cache') || '{}');
        } catch {
            return {};
        }
    }

    function saveGeocodeCache(cache) {
        try {
            localStorage.setItem('odznakago-geocode-cache', JSON.stringify(cache));
        } catch {
            // Ignore cache save errors (quota/private mode)
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

    window.handleCheckIn = (pointKey) => {
        const cameraInput = document.getElementById(`camera-${pointKey}`);
        cameraInput.onchange = () => {
            const file = cameraInput.files[0];
            if (file) {
                console.log(`Placeholder: Wysyłanie ${file.name} dla punktu ${pointKey} do Firebase Storage...`);
                // W tym miejscu docelowo znajdzie się kod do uploadu pliku do Firebase Storage
                // np. uploadToFirebase(file, pointKey);
                alert('Zdjęcie przechwycone! (Funkcjonalność w trakcie implementacji)');
            }
        };
        cameraInput.click();
    };

    loadBadges();
});
