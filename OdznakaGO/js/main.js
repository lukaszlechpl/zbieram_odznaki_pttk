import { loadBadgeData } from './modules/data-loader.js';
import { MapView } from './modules/map-view.js';
import { UI } from './modules/ui.js';
import { GoogleAuth } from './modules/google-auth.js';
import { VisitsStore } from './modules/visits-store.js';
import { escapeHtml } from './modules/utils.js';
import { haversineMeters } from './modules/geo.js';

const LOCAL_MAP_VIEW_KEY = 'odznakaGO.mapView';
const DEFAULT_FILTER = 'all';
const VISIT_DISTANCE_LIMIT_M = 250;

document.addEventListener('DOMContentLoaded', async () => {
    const ui = new UI();
    const auth = new GoogleAuth({
        clientId: window.ODZNAKAGO_GOOGLE_CLIENT_ID || ''
    });
    await auth.init();

    let visitsStore = null;
    let filter = DEFAULT_FILTER;
    let allPoints = [];
    const pointById = new Map();

    const mapView = new MapView({
        mapElementId: 'map',
        isLoggedIn: () => auth.isLoggedIn(),
        getFilter: () => filter,
        getPointPopupHtml: (point) => renderPointDetails(point)
    });

    function setFilter(next) {
        filter = next || DEFAULT_FILTER;
        ui.setFilter(filter);
        if (auth.isLoggedIn() && visitsStore) {
            visitsStore.preferences.filter = filter;
            visitsStore.savePreferences().catch(console.error);
        }
        mapView.render();
    }

    function saveMapViewPreference() {
        const view = mapView.getView();
        if (!auth.isLoggedIn() || !visitsStore) {
            localStorage.setItem(LOCAL_MAP_VIEW_KEY, JSON.stringify(view));
            return;
        }
        visitsStore.preferences.mapView = view;
        visitsStore.savePreferences().catch(console.error);
    }

    mapView.map.on('moveend', saveMapViewPreference);

    ui.bindBasicActions({
        onShowMap: () => ui.showMapView(() => mapView.map.invalidateSize()),
        onToggleBadgeList: () => ui.toggleBadgeList(),
        onFilterChange: (value) => setFilter(value),
        onLogin: async () => {
            try {
                if (!auth.isConfigured()) {
                    alert('Brak konfiguracji Google OAuth Client ID po stronie aplikacji.');
                    return;
                }
                await auth.signIn();
                visitsStore = new VisitsStore(auth.accessToken);
                await visitsStore.init();
                filter = visitsStore.preferences.filter || DEFAULT_FILTER;
                ui.setFilter(filter);
                if (visitsStore.preferences.mapView) mapView.setView(visitsStore.preferences.mapView);
                applyVisitsOnPoints();
                ui.setAuthState({ loggedIn: true, userName: auth.user?.name || 'Użytkownik', configured: auth.isConfigured() });
                mapView.render();
            } catch (error) {
                console.error(error);
                alert('Logowanie Google nie powiodło się.');
            }
        },
        onLogout: () => {
            auth.signOut();
            visitsStore = null;
            filter = DEFAULT_FILTER;
            applyVisitsOnPoints();
            ui.setFilter(filter);
            ui.setAuthState({ loggedIn: false, userName: '', configured: auth.isConfigured() });
            mapView.render();
        }
    });

    ui.setAuthState({ loggedIn: false, userName: '', configured: auth.isConfigured() });
    ui.setFilter(filter);
    const localViewRaw = localStorage.getItem(LOCAL_MAP_VIEW_KEY);
    if (localViewRaw) {
        try {
            mapView.setView(JSON.parse(localViewRaw));
        } catch {
            // ignore invalid local preference
        }
    }
    await mapView.locateUser({ useFallback: false });

    if (auth.isConfigured()) {
        const silentUser = await auth.trySilentSignIn();
        if (silentUser) {
            visitsStore = new VisitsStore(auth.accessToken);
            await visitsStore.init();
            filter = visitsStore.preferences.filter || DEFAULT_FILTER;
            ui.setFilter(filter);
            if (visitsStore.preferences.mapView) mapView.setView(visitsStore.preferences.mapView);
            ui.setAuthState({ loggedIn: true, userName: auth.user?.name || 'Użytkownik', configured: true });
        }
    }

    const { badgeEntries, allPoints: loadedPoints, resolveResourcePath } = await loadBadgeData();
    allPoints = loadedPoints;
    allPoints.forEach((p) => pointById.set(p.id, p));
    applyVisitsOnPoints();
    mapView.setPoints(allPoints);
    ui.renderBadgeList(badgeEntries, (badge) => ui.showBadgePage(badge, resolveResourcePath).catch(console.error));
    ui.showMapView(() => mapView.map.invalidateSize());

    document.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const actionButton = target.closest('button[data-action="visit"]');
        if (!actionButton) return;
        const pointId = actionButton.dataset.pointId;
        if (!pointId || !auth.isLoggedIn() || !visitsStore) return;
        const point = pointById.get(pointId);
        if (!point) return;
        await openVisitEditor(point);
    });

    function applyVisitsOnPoints() {
        allPoints = allPoints.map((point) => ({
            ...point,
            isVisited: visitsStore ? visitsStore.isVisited(point.id) : false
        }));
        pointById.clear();
        allPoints.forEach((p) => pointById.set(p.id, p));
        mapView.setPoints(allPoints);
    }

    function renderPointDetails(point) {
        const badgesList = point.badges.map((name) => `<li>${escapeHtml(name)}</li>`).join('');
        const visitBadge = auth.isLoggedIn() && point.isVisited
            ? '<div style="color:#15803d;font-weight:700;margin-top:6px;">odwiedzony</div>'
            : '';
        const visitButton = auth.isLoggedIn()
            ? `<button type="button" class="check-in-btn" data-action="visit" data-point-id="${escapeHtml(point.id)}">${point.isVisited ? 'Edytuj szczegóły wizyty' : 'Dodaj wizytę'}</button>`
            : '';
        return `
            <b>${escapeHtml(point.name)}</b><br>
            ${escapeHtml(point.address || '')}<br>
            ${visitBadge}
            <b>Ten punkt zalicza się do odznak:</b>
            <ul>${badgesList}</ul>
            ${visitButton}
        `;
    }

    async function openVisitEditor(point) {
        const existingVisit = visitsStore.getVisit(point.id);
        const description = existingVisit ? await visitsStore.getVisitDescription(existingVisit) : '';
        const isNear = haversineMeters(mapView.currentPosition, point.coords) <= VISIT_DISTANCE_LIMIT_M;
        const defaultDateIso = !existingVisit && isNear ? new Date().toISOString() : '';
        const tempVisit = existingVisit || { id_punktu: point.id, data_wizyty: defaultDateIso, id_opis: '', id_zdjec: [] };
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        ui.photoInput.setAttribute('accept', isMobile ? (isNear ? 'image/*;capture=camera' : 'image/*') : 'image/*');
        ui.photoDropzone.textContent = isMobile
            ? (isNear ? 'Dodaj zdjęcie (możesz użyć aparatu lub wybrać plik).' : 'Wybierz istniejące zdjęcia.')
            : 'Przeciągnij zdjęcia tutaj lub kliknij, aby dodać.';

        ui.openVisitDialog({
            title: `${point.name} (${point.isVisited ? 'edycja wizyty' : 'nowa wizyta'})`,
            visit: tempVisit,
            description,
            onSave: async ({ dateIso, description: desc }) => {
                await visitsStore.upsertVisit({ pointId: point.id, dateIso, description: desc });
                applyVisitsOnPoints();
                mapView.render();
            },
            onCancel: () => {},
            onPhotoAdd: async (file) => {
                await visitsStore.addPhotoToVisit(point.id, file);
                const visit = visitsStore.getVisit(point.id);
                ui.renderPhotoList(visit.id_zdjec || [], handlePhotoRemove, handlePhotoOpen);
                applyVisitsOnPoints();
            },
            onPhotoRemove: handlePhotoRemove,
            onPhotoOpen: handlePhotoOpen
        });
    }

    async function handlePhotoRemove(photoId) {
        const openedPointId = [...pointById.values()].find((p) => visitsStore?.getVisit(p.id)?.id_zdjec?.includes(photoId))?.id;
        if (!openedPointId) return;
        await visitsStore.removePhotoFromVisit(openedPointId, photoId);
        const visit = visitsStore.getVisit(openedPointId);
        ui.renderPhotoList(visit?.id_zdjec || [], handlePhotoRemove, handlePhotoOpen);
    }

    async function handlePhotoOpen(photoId, imgElement, options = {}) {
        const { previewOnly = false } = options;
        const blob = await visitsStore.getPhotoBlob(photoId);
        const url = URL.createObjectURL(blob);
        if (imgElement && !imgElement.src) imgElement.src = url;
        if (!previewOnly) window.open(url, '_blank', 'noopener,noreferrer');
    }
});
