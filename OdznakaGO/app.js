document.addEventListener('DOMContentLoaded', () => {
    const MAX_VISIBLE_POINTS = 150;
    const DEFAULT_WARSAW_CENTER = [52.2297, 21.0122];
    const LOCATION_VIEW_RADIUS_M = 25000;
    const MAP_VIEW_SESSION_KEY = 'odznakaGO.mapView';
    const map = L.map('map');
    let userLocationMarker = null;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    addRecenterControl();
    initializeMapView();

    const displayLayer = L.layerGroup().addTo(map);
    const pointsByCoord = new Map();
    const missingCoordsLoggedCsvFiles = new Set();
    const badgeEntries = [];
    let allPoints = [];

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
                    const rows = parseCSV(csvText);
                    const header = rows[0] || [];

                    const normHeader = header.map((h) => String(h || '').replace(/^\ufeff/, '').trim());
                    const headerIndex = new Map(normHeader.map((h, i) => [h, i]));

                    const nameIdx = headerIndex.has('nazwa_obiektu') ? headerIndex.get('nazwa_obiektu') : 0;
                    const addressIdx = headerIndex.has('adres') ? headerIndex.get('adres') : 3;
                    // Dla różnych wersji formatów CSV GPS bywa w `lokalizacja` albo `wspolrzedne`.
                    const coordsIdx = headerIndex.has('lokalizacja')
                        ? headerIndex.get('lokalizacja')
                        : headerIndex.has('wspolrzedne')
                            ? headerIndex.get('wspolrzedne')
                            : -1;

                    const points = rows.slice(1);
                    if (coordsIdx < 0) {
                        console.info(`Plik CSV bez kolumny GPS (lokalizacja/wspolrzedne): ${csvPath}`);
                        continue;
                    }

                    for (const point of points) {
                        const name = point[nameIdx];
                        const address = point[addressIdx];
                        const coordsRaw = point[coordsIdx];
                        if (!name && !address) continue;

                        const coords = parseCoordinates(coordsRaw);
                        if (!coords) {
                            if (!missingCoordsLoggedCsvFiles.has(csvPath)) {
                                missingCoordsLoggedCsvFiles.add(csvPath);
                                console.info(`Plik CSV wymaga uzupelnienia wspolrzednych: ${csvPath}`);
                            }
                            continue;
                        }

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
            allPoints = normalizedPoints;
            showMapView();
            setTimeout(() => updateVisibleMapMarkers(), 0);
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

    map.on('moveend', () => {
        saveMapViewToSession();
        updateVisibleMapMarkers();
    });

    function updateVisibleMapMarkers() {
        if (!allPoints || allPoints.length === 0) return;
        const visiblePoints = getVisiblePoints(allPoints);
        renderVisiblePoints(visiblePoints);
    }

    function addRecenterControl() {
        const RecenterControl = L.Control.extend({
            options: {
                position: 'bottomright'
            },
            onAdd() {
                const button = L.DomUtil.create('button', 'leaflet-bar leaflet-control');
                button.type = 'button';
                button.title = 'Centruj na mojej lokalizacji';
                button.setAttribute('aria-label', 'Centruj na mojej lokalizacji');
                button.textContent = '⌖';
                button.style.width = '34px';
                button.style.height = '34px';
                button.style.fontSize = '20px';
                button.style.lineHeight = '30px';
                button.style.fontWeight = '700';
                button.style.background = '#fff';
                button.style.cursor = 'pointer';
                button.style.border = 'none';

                L.DomEvent.on(button, 'click', (event) => {
                    L.DomEvent.stop(event);
                    centerMapOnCurrentLocation();
                });
                L.DomEvent.disableClickPropagation(button);
                return button;
            }
        });

        map.addControl(new RecenterControl());
    }

    function initializeMapView() {
        const restored = restoreMapViewFromSession();
        if (restored) return;
        setMapViewForLocation(DEFAULT_WARSAW_CENTER);
        centerMapOnCurrentLocation({ useFallback: false });
    }

    function saveMapViewToSession() {
        const center = map.getCenter();
        const zoom = map.getZoom();
        if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng) || !Number.isFinite(zoom)) return;
        const payload = {
            lat: center.lat,
            lng: center.lng,
            zoom
        };
        localStorage.setItem(MAP_VIEW_SESSION_KEY, JSON.stringify(payload));
    }

    function restoreMapViewFromSession() {
        const raw = localStorage.getItem(MAP_VIEW_SESSION_KEY);
        if (!raw) return false;
        try {
            const parsed = JSON.parse(raw);
            const { lat, lng, zoom } = parsed || {};
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return false;
            map.setView([lat, lng], zoom);
            return true;
        } catch {
            return false;
        }
    }

    async function centerMapOnCurrentLocation(options = {}) {
        const { useFallback = false } = options;
        const userCoords = await getCurrentPositionCoordinates();
        if (userCoords) {
            setMapViewForLocation(userCoords);
            setUserLocationMarker(userCoords);
            return;
        }
        if (useFallback) {
            setMapViewForLocation(DEFAULT_WARSAW_CENTER);
            if (userLocationMarker) {
                map.removeLayer(userLocationMarker);
                userLocationMarker = null;
            }
        }
    }

    function setMapViewForLocation(coords) {
        const latLng = L.latLng(coords[0], coords[1]);
        const bounds = latLng.toBounds(LOCATION_VIEW_RADIUS_M * 2);
        map.fitBounds(bounds);
    }

    function setUserLocationMarker(coords) {
        if (!userLocationMarker) {
            userLocationMarker = L.circleMarker(coords, {
                radius: 7,
                color: '#1d4ed8',
                weight: 2,
                fillColor: '#3b82f6',
                fillOpacity: 0.9
            }).addTo(map);
            return;
        }
        userLocationMarker.setLatLng(coords);
        if (!map.hasLayer(userLocationMarker)) {
            userLocationMarker.addTo(map);
        }
    }

    function getCurrentPositionCoordinates() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = Number(position?.coords?.latitude);
                    const lng = Number(position?.coords?.longitude);
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                        resolve(null);
                        return;
                    }
                    resolve([lat, lng]);
                },
                () => resolve(null),
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                }
            );
        });
    }

    function getVisiblePoints(points) {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const minLat = sw.lat;
        const maxLat = ne.lat;
        const minLng = sw.lng;
        const maxLng = ne.lng;

        return points.filter((p) => {
            const [lat, lon] = p.coords;
            return lat >= minLat && lat <= maxLat && lon >= minLng && lon <= maxLng;
        });
    }

    function renderVisiblePoints(points) {
        displayLayer.clearLayers();
        if (!points.length) return;

        const clusters = clusterVisiblePoints(points, 10, MAX_VISIBLE_POINTS);
        clusters.forEach((cluster) => {
            if (cluster.points.length === 1) {
                displayLayer.addLayer(createPointMarker(cluster.points[0]));
            } else {
                displayLayer.addLayer(createGroupMarker(cluster));
            }
        });
    }

    function clusterVisiblePoints(points, minDistancePx, maxGroups) {
        // Etap 1: na bazie aktualnego zoomu grupujemy punkty, które na ekranie
        // są bliżej niż `minDistancePx` (połączone składowe spójności).
        const pointsWithPx = points.map((point) => {
            const px = map.latLngToContainerPoint(point.coords);
            return { point, x: px.x, y: px.y };
        });
        const nearClusters = clusterByPixelDistance(pointsWithPx, minDistancePx);

        // Etap 2: jeśli liczba markerów (grup) przekracza limit, wykonujemy
        // dodatkowe grupowanie po siatce w przestrzeni pikseli.
        if (nearClusters.length <= maxGroups) return nearClusters;
        return mergeClustersByPixelGrid(nearClusters, maxGroups);
    }

    function clusterByPixelDistance(pointsWithPx, thresholdPx) {
        const thresholdSq = thresholdPx * thresholdPx;
        const cellSize = thresholdPx; // pozwala ograniczyć sprawdzanie sąsiadów
        const n = pointsWithPx.length;

        const parent = Array.from({ length: n }, (_, i) => i);

        function find(i) {
            while (parent[i] !== i) {
                parent[i] = parent[parent[i]];
                i = parent[i];
            }
            return i;
        }

        function union(a, b) {
            const ra = find(a);
            const rb = find(b);
            if (ra === rb) return;
            parent[rb] = ra;
        }

        const cellX = new Array(n);
        const cellY = new Array(n);
        const buckets = new Map(); // "cx:cy" -> [indices]

        for (let i = 0; i < n; i += 1) {
            const { x, y } = pointsWithPx[i];
            const cx = Math.floor(x / cellSize);
            const cy = Math.floor(y / cellSize);
            cellX[i] = cx;
            cellY[i] = cy;
            const key = `${cx}:${cy}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(i);
        }

        for (let i = 0; i < n; i += 1) {
            const x = pointsWithPx[i].x;
            const y = pointsWithPx[i].y;

            for (let ox = -1; ox <= 1; ox += 1) {
                for (let oy = -1; oy <= 1; oy += 1) {
                    const nx = cellX[i] + ox;
                    const ny = cellY[i] + oy;
                    const key = `${nx}:${ny}`;
                    const candidates = buckets.get(key) || [];

                    for (const j of candidates) {
                        if (j <= i) continue;
                        const dx = x - pointsWithPx[j].x;
                        const dy = y - pointsWithPx[j].y;
                        if ((dx * dx + dy * dy) <= thresholdSq) {
                            union(i, j);
                        }
                    }
                }
            }
        }

        const grouped = new Map(); // root -> points
        for (let i = 0; i < n; i += 1) {
            const root = find(i);
            if (!grouped.has(root)) grouped.set(root, []);
            grouped.get(root).push(pointsWithPx[i].point);
        }

        return [...grouped.values()].map((bucket) => {
            const center = bucket.reduce((acc, point) => {
                acc[0] += point.coords[0];
                acc[1] += point.coords[1];
                return acc;
            }, [0, 0]).map((sum) => sum / bucket.length);
            return { center, points: bucket };
        });
    }

    function mergeClustersByPixelGrid(clusters, maxGroups) {
        const mapSize = map.getSize();
        const maxCellSize = Math.max(mapSize.x, mapSize.y) * 4;

        const clustersWithPx = clusters.map((cluster) => {
            const px = map.latLngToContainerPoint(cluster.center);
            return { cluster, x: px.x, y: px.y };
        });

        let cellSize = 15; // start: dopasowanie do warunku "10px" (10px już jest wpięte w Etap 1)
        let finalBuckets = null;

        for (let iter = 0; iter < 24; iter += 1) {
            const buckets = new Map(); // "cx:cy" -> [clusterIndex]
            for (const item of clustersWithPx) {
                const cx = Math.floor(item.x / cellSize);
                const cy = Math.floor(item.y / cellSize);
                const key = `${cx}:${cy}`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(item.cluster);
            }

            if (buckets.size <= maxGroups) {
                finalBuckets = buckets;
                break;
            }

            finalBuckets = buckets;
            cellSize *= 1.4;
            if (cellSize > maxCellSize) break;
        }

        return [...finalBuckets.values()].map((bucketClusters) => {
            const mergedPoints = bucketClusters.flatMap((c) => c.points);
            const center = mergedPoints.reduce((acc, point) => {
                acc[0] += point.coords[0];
                acc[1] += point.coords[1];
                return acc;
            }, [0, 0]).map((sum) => sum / mergedPoints.length);
            return { center, points: mergedPoints };
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
        marker.bindPopup(`<b>Grupa ${group.points.length} punktów</b><ul class="group-popup-list" style="max-height:250px;overflow:auto;">${listItems}</ul>`);
        return marker;
    }

    function parseCSV(text) {
        const lines = String(text || '')
            .replace(/\r/g, '')
            .split('\n')
            .filter((line) => {
                const trimmed = line.trim();
                return trimmed.length > 0 && !trimmed.startsWith('#');
            });
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
