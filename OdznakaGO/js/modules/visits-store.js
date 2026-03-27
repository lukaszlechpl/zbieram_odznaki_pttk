import { deleteFile, ensureFolder, fetchBlob, readJson, uploadBlob, upsertJson, findFileByName } from './drive-api.js';
import { uuid } from './utils.js';

const VISITS_FILE = 'wizyty.json';
const PREFS_FILE = 'preferencje.json';
const DESCRIPTIONS_DIR = 'wizyty_opisy';
const PHOTOS_DIR = 'wizyty_zdjecia';

export class VisitsStore {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.visits = [];
        this.preferences = { filter: 'all', mapView: null };
        this.descriptionsFolderId = '';
        this.photosFolderId = '';
    }

    async init() {
        this.descriptionsFolderId = await ensureFolder(this.accessToken, DESCRIPTIONS_DIR);
        this.photosFolderId = await ensureFolder(this.accessToken, PHOTOS_DIR);
        this.visits = (await readJson(this.accessToken, VISITS_FILE)) || [];
        this.preferences = (await readJson(this.accessToken, PREFS_FILE)) || this.preferences;
    }

    getVisit(pointId) {
        return this.visits.find((v) => v.id_punktu === pointId) || null;
    }

    isVisited(pointId) {
        return Boolean(this.getVisit(pointId));
    }

    async saveVisits() {
        await upsertJson(this.accessToken, VISITS_FILE, this.visits);
    }

    async savePreferences() {
        await upsertJson(this.accessToken, PREFS_FILE, this.preferences);
    }

    async upsertVisit({ pointId, dateIso, description }) {
        let visit = this.getVisit(pointId);
        if (!visit) {
            visit = { id_punktu: pointId, data_wizyty: '', id_opis: '', id_zdjec: [] };
            this.visits.push(visit);
        }
        visit.data_wizyty = dateIso || '';
        if (description) {
            if (!visit.id_opis) visit.id_opis = uuid();
            await upsertJson(this.accessToken, `${visit.id_opis}.json`, { text: description }, this.descriptionsFolderId);
        }
        if (!description && visit.id_opis) {
            const existing = await findFileByName(this.accessToken, `${visit.id_opis}.json`, this.descriptionsFolderId);
            if (existing) await deleteFile(this.accessToken, existing.id);
            visit.id_opis = '';
        }
        await this.saveVisits();
        return visit;
    }

    async getVisitDescription(visit) {
        if (!visit?.id_opis) return '';
        const json = await readJson(this.accessToken, `${visit.id_opis}.json`, this.descriptionsFolderId);
        return String(json?.text || '');
    }

    async addPhotoToVisit(pointId, file) {
        let visit = this.getVisit(pointId);
        if (!visit) {
            visit = { id_punktu: pointId, data_wizyty: '', id_opis: '', id_zdjec: [] };
            this.visits.push(visit);
        }
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const uploaded = await uploadBlob(this.accessToken, this.photosFolderId, `${uuid()}.${ext}`, file);
        visit.id_zdjec = visit.id_zdjec || [];
        visit.id_zdjec.push(uploaded.id);
        await this.saveVisits();
        return uploaded.id;
    }

    async removePhotoFromVisit(pointId, photoId) {
        const visit = this.getVisit(pointId);
        if (!visit?.id_zdjec) return;
        visit.id_zdjec = visit.id_zdjec.filter((id) => id !== photoId);
        await deleteFile(this.accessToken, photoId);
        await this.saveVisits();
    }

    async getPhotoBlob(photoId) {
        return fetchBlob(this.accessToken, photoId);
    }
}
