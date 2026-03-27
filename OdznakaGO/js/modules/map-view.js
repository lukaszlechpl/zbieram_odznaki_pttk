const MAX_VISIBLE_POINTS = 150;
const DEFAULT_WARSAW_CENTER = [52.2297, 21.0122];
const LOCATION_VIEW_RADIUS_M = 25000;

export class MapView {
    constructor({ mapElementId, isLoggedIn, getFilter, getPointPopupHtml }) {
        this.map = L.map(mapElementId);
        this.displayLayer = L.layerGroup().addTo(this.map);
        this.userLocationMarker = null;
        this.currentPosition = null;
        this.allPoints = [];
        this.isLoggedIn = isLoggedIn;
        this.getFilter = getFilter;
        this.getPointPopupHtml = getPointPopupHtml;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);
        this.addRecenterControl();
        this.map.setView(DEFAULT_WARSAW_CENTER, 7);
        this.map.on('moveend', () => this.render());
    }

    setPoints(points) {
        this.allPoints = points || [];
        this.render();
    }

    setView(view) {
        if (!view) return;
        const { lat, lng, zoom } = view;
        if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom)) {
            this.map.setView([lat, lng], zoom);
        }
    }

    getView() {
        const center = this.map.getCenter();
        return { lat: center.lat, lng: center.lng, zoom: this.map.getZoom() };
    }

    async locateUser({ useFallback = false } = {}) {
        const userCoords = await this.getCurrentPositionCoordinates();
        if (userCoords) {
            this.currentPosition = userCoords;
            this.setMapViewForLocation(userCoords);
            this.setUserLocationMarker(userCoords);
            return userCoords;
        }
        if (useFallback) this.setMapViewForLocation(DEFAULT_WARSAW_CENTER);
        return null;
    }

    render() {
        const points = this.getFilteredVisiblePoints();
        this.displayLayer.clearLayers();
        if (!points.length) return;
        const clusters = this.clusterVisiblePoints(points, 10, MAX_VISIBLE_POINTS);
        clusters.forEach((cluster) => {
            if (cluster.points.length === 1) this.displayLayer.addLayer(this.createPointMarker(cluster.points[0]));
            else this.displayLayer.addLayer(this.createGroupMarker(cluster));
        });
    }

    getFilteredVisiblePoints() {
        const bounds = this.map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        return this.allPoints.filter((p) => {
            const [lat, lon] = p.coords;
            const inBounds = lat >= sw.lat && lat <= ne.lat && lon >= sw.lng && lon <= ne.lng;
            if (!inBounds) return false;
            if (!this.isLoggedIn()) return true;
            const filter = this.getFilter();
            if (filter === 'all') return true;
            if (filter === 'visited') return p.isVisited;
            return !p.isVisited;
        });
    }

    createPointMarker(point) {
        const marker = L.marker(point.coords);
        marker.bindPopup(this.getPointPopupHtml(point));
        return marker;
    }

    createGroupMarker(group) {
        const marker = L.marker(group.center, {
            icon: L.divIcon({
                className: 'custom-group-marker',
                html: `<div style="background:#2563eb;color:#fff;border-radius:999px;min-width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff;">${group.points.length}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            })
        });
        const groupedItems = group.points.map((point) => `<div class="group-popup-item">${this.getPointPopupHtml(point)}</div>`).join('');
        marker.bindPopup(`<div><b>Grupa ${group.points.length} punktów</b><div class="group-popup-content">${groupedItems}</div></div>`);
        return marker;
    }

    clusterVisiblePoints(points, minDistancePx, maxGroups) {
        const pointsWithPx = points.map((point) => {
            const px = this.map.latLngToContainerPoint(point.coords);
            return { point, x: px.x, y: px.y };
        });
        const nearClusters = this.clusterByPixelDistance(pointsWithPx, minDistancePx);
        if (nearClusters.length <= maxGroups) return nearClusters;
        return this.mergeClustersByPixelGrid(nearClusters, maxGroups);
    }

    clusterByPixelDistance(pointsWithPx, thresholdPx) {
        const thresholdSq = thresholdPx * thresholdPx;
        const cellSize = thresholdPx;
        const n = pointsWithPx.length;
        const parent = Array.from({ length: n }, (_, i) => i);
        const find = (i) => {
            while (parent[i] !== i) {
                parent[i] = parent[parent[i]];
                i = parent[i];
            }
            return i;
        };
        const union = (a, b) => {
            const ra = find(a);
            const rb = find(b);
            if (ra !== rb) parent[rb] = ra;
        };
        const buckets = new Map();
        const cellX = new Array(n);
        const cellY = new Array(n);
        for (let i = 0; i < n; i += 1) {
            const cx = Math.floor(pointsWithPx[i].x / cellSize);
            const cy = Math.floor(pointsWithPx[i].y / cellSize);
            cellX[i] = cx;
            cellY[i] = cy;
            const key = `${cx}:${cy}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(i);
        }
        for (let i = 0; i < n; i += 1) {
            for (let ox = -1; ox <= 1; ox += 1) {
                for (let oy = -1; oy <= 1; oy += 1) {
                    const key = `${cellX[i] + ox}:${cellY[i] + oy}`;
                    const candidates = buckets.get(key) || [];
                    for (const j of candidates) {
                        if (j <= i) continue;
                        const dx = pointsWithPx[i].x - pointsWithPx[j].x;
                        const dy = pointsWithPx[i].y - pointsWithPx[j].y;
                        if ((dx * dx + dy * dy) <= thresholdSq) union(i, j);
                    }
                }
            }
        }
        const grouped = new Map();
        for (let i = 0; i < n; i += 1) {
            const root = find(i);
            if (!grouped.has(root)) grouped.set(root, []);
            grouped.get(root).push(pointsWithPx[i].point);
        }
        return [...grouped.values()].map((bucket) => ({
            center: bucket.reduce((acc, point) => [acc[0] + point.coords[0], acc[1] + point.coords[1]], [0, 0]).map((s) => s / bucket.length),
            points: bucket
        }));
    }

    mergeClustersByPixelGrid(clusters, maxGroups) {
        const mapSize = this.map.getSize();
        const maxCellSize = Math.max(mapSize.x, mapSize.y) * 4;
        const clustersWithPx = clusters.map((cluster) => {
            const px = this.map.latLngToContainerPoint(cluster.center);
            return { cluster, x: px.x, y: px.y };
        });
        let cellSize = 15;
        let finalBuckets = null;
        for (let iter = 0; iter < 24; iter += 1) {
            const buckets = new Map();
            for (const item of clustersWithPx) {
                const key = `${Math.floor(item.x / cellSize)}:${Math.floor(item.y / cellSize)}`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(item.cluster);
            }
            finalBuckets = buckets;
            if (buckets.size <= maxGroups) break;
            cellSize *= 1.4;
            if (cellSize > maxCellSize) break;
        }
        return [...finalBuckets.values()].map((bucketClusters) => {
            const mergedPoints = bucketClusters.flatMap((c) => c.points);
            return {
                center: mergedPoints.reduce((acc, point) => [acc[0] + point.coords[0], acc[1] + point.coords[1]], [0, 0]).map((s) => s / mergedPoints.length),
                points: mergedPoints
            };
        });
    }

    addRecenterControl() {
        const control = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: () => {
                const button = L.DomUtil.create('button', 'leaflet-bar leaflet-control');
                button.type = 'button';
                button.title = 'Centruj na mojej lokalizacji';
                button.textContent = '⌖';
                button.style.width = '34px';
                button.style.height = '34px';
                button.style.fontSize = '20px';
                button.style.fontWeight = '700';
                L.DomEvent.on(button, 'click', async (event) => {
                    L.DomEvent.stop(event);
                    await this.locateUser({ useFallback: true });
                });
                L.DomEvent.disableClickPropagation(button);
                return button;
            }
        });
        this.map.addControl(new control());
    }

    setMapViewForLocation(coords) {
        const latLng = L.latLng(coords[0], coords[1]);
        const bounds = latLng.toBounds(LOCATION_VIEW_RADIUS_M * 2);
        this.map.fitBounds(bounds);
    }

    setUserLocationMarker(coords) {
        if (!this.userLocationMarker) {
            this.userLocationMarker = L.circleMarker(coords, {
                radius: 7, color: '#1d4ed8', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.9
            }).addTo(this.map);
            return;
        }
        this.userLocationMarker.setLatLng(coords);
        if (!this.map.hasLayer(this.userLocationMarker)) this.userLocationMarker.addTo(this.map);
    }

    getCurrentPositionCoordinates() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                (position) => resolve([Number(position.coords.latitude), Number(position.coords.longitude)]),
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            );
        });
    }
}
