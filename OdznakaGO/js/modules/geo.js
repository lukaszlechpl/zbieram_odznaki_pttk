export function parseCoordinates(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return null;

    let first = Number(match[1]);
    let second = Number(match[2]);
    if (Number.isNaN(first) || Number.isNaN(second)) return null;

    let lat = second;
    let lon = first;
    if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
        lat = first;
        lon = second;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return [lat, lon];
}

export function extractPlaceId(mapsUrl) {
    const raw = String(mapsUrl || '');
    const match = raw.match(/place_id:([^&\s]+)/);
    return match ? match[1] : '';
}

export function haversineMeters(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}
