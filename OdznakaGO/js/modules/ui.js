import { escapeHtml, fromDatetimeLocalValue, toDatetimeLocalValue } from './utils.js';

export class UI {
    constructor() {
        this.mapContainer = document.getElementById('map');
        this.badgeView = document.getElementById('badge-view');
        this.badgeSource = document.getElementById('badge-source');
        this.badgeContent = document.getElementById('badge-content');
        this.showMapBtn = document.getElementById('show-map-btn');
        this.badgeListToggle = document.getElementById('badge-list-toggle');
        this.badgeList = document.getElementById('badge-list');
        this.filterBar = document.getElementById('filter-bar');
        this.authStatus = document.getElementById('auth-status');
        this.loginBtn = document.getElementById('login-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.visitDialog = document.getElementById('visit-dialog');
        this.visitTitle = document.getElementById('visit-title');
        this.visitDatetime = document.getElementById('visit-datetime');
        this.visitDescription = document.getElementById('visit-description');
        this.photoInput = document.getElementById('visit-photo-input');
        this.photoDropzone = document.getElementById('photo-dropzone');
        this.photoList = document.getElementById('photo-list');
        this.visitCancelBtn = document.getElementById('visit-cancel-btn');
        this.visitSaveBtn = document.getElementById('visit-save-btn');
    }

    bindBasicActions({ onShowMap, onToggleBadgeList, onFilterChange, onLogin, onLogout }) {
        this.showMapBtn.addEventListener('click', onShowMap);
        this.badgeListToggle.addEventListener('click', onToggleBadgeList);
        this.loginBtn.addEventListener('click', onLogin);
        this.logoutBtn.addEventListener('click', onLogout);
        this.filterBar.querySelectorAll('button[data-filter]').forEach((button) => {
            button.addEventListener('click', () => onFilterChange(button.dataset.filter));
        });
    }

    setFilter(filter) {
        this.filterBar.querySelectorAll('button[data-filter]').forEach((button) => {
            button.classList.toggle('active', button.dataset.filter === filter);
        });
    }

    setAuthState({ loggedIn, userName, configured }) {
        if (!configured) {
            this.authStatus.textContent = 'Brak konfiguracji Google OAuth (CLIENT_ID) po stronie aplikacji.';
            this.loginBtn.style.display = 'inline-block';
            this.loginBtn.disabled = false;
            this.loginBtn.title = 'Kliknij, aby sprawdzić konfigurację logowania Google.';
            this.logoutBtn.style.display = 'none';
            this.filterBar.style.display = 'none';
            return;
        }
        this.loginBtn.disabled = false;
        this.loginBtn.title = '';
        this.filterBar.style.display = loggedIn ? 'flex' : 'none';
        this.loginBtn.style.display = loggedIn ? 'none' : 'inline-block';
        this.logoutBtn.style.display = loggedIn ? 'inline-block' : 'none';
        this.authStatus.textContent = loggedIn ? `Zalogowano: ${userName}` : 'Tryb gość (tylko podgląd)';
    }

    renderBadgeList(badgeEntries, onBadgeClick) {
        this.badgeList.innerHTML = '';
        badgeEntries.forEach((badge) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'badge-link';
            item.textContent = badge.name;
            item.addEventListener('click', () => onBadgeClick(badge));
            this.badgeList.appendChild(item);
        });
    }

    showMapView(onMapVisible) {
        this.badgeView.style.display = 'none';
        this.mapContainer.style.display = 'block';
        this.badgeSource.innerHTML = '';
        setTimeout(onMapVisible, 0);
    }

    async showBadgePage(badge, resolveResourcePath) {
        this.mapContainer.style.display = 'none';
        this.badgeView.style.display = 'flex';
        this.badgeContent.innerHTML = `<h1>${escapeHtml(badge.name)}</h1><p>Ładowanie treści odznaki...</p>`;
        if (badge.url) {
            this.badgeSource.textContent = 'Źródło: ';
            const link = document.createElement('a');
            link.href = badge.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = badge.url;
            this.badgeSource.appendChild(link);
        } else {
            this.badgeSource.textContent = 'Brak linku źródłowego dla tej odznaki.';
        }
        const mdPath = resolveResourcePath(badge.mdFile);
        if (!mdPath) {
            this.badgeContent.innerHTML = `<h1>${escapeHtml(badge.name)}</h1><p>Brak lokalnego opisu.</p>`;
            return;
        }
        const response = await fetch(mdPath);
        const markdown = response.ok ? await response.text() : `# ${badge.name}\n\nBrak treści opisu.`;
        this.badgeContent.innerHTML = marked.parse(markdown);
    }

    toggleBadgeList() {
        const isHidden = this.badgeList.style.display === 'none';
        this.badgeList.style.display = isHidden ? 'block' : 'none';
        this.badgeListToggle.textContent = isHidden ? 'lista odznak' : 'lista odznak (ukryta)';
    }

    openVisitDialog({ title, visit, description, onSave, onCancel, onPhotoAdd, onPhotoRemove, onPhotoOpen }) {
        this.visitTitle.textContent = title;
        this.visitDatetime.value = toDatetimeLocalValue(visit?.data_wizyty || '');
        this.visitDescription.value = description || '';
        this.renderPhotoList(visit?.id_zdjec || [], onPhotoRemove, onPhotoOpen);

        this.photoDropzone.onclick = () => this.photoInput.click();
        this.photoDropzone.ondragover = (event) => {
            event.preventDefault();
            this.photoDropzone.style.borderColor = '#2563eb';
        };
        this.photoDropzone.ondragleave = () => {
            this.photoDropzone.style.borderColor = '#cbd5e1';
        };
        this.photoDropzone.ondrop = async (event) => {
            event.preventDefault();
            this.photoDropzone.style.borderColor = '#cbd5e1';
            const files = [...(event.dataTransfer?.files || [])];
            for (const file of files) await onPhotoAdd(file);
        };
        this.photoInput.onchange = async () => {
            const files = [...(this.photoInput.files || [])];
            for (const file of files) await onPhotoAdd(file);
            this.photoInput.value = '';
        };

        this.visitSaveBtn.onclick = async () => {
            await onSave({
                dateIso: fromDatetimeLocalValue(this.visitDatetime.value),
                description: this.visitDescription.value.trim()
            });
            this.visitDialog.close();
        };
        this.visitCancelBtn.onclick = () => {
            onCancel();
            this.visitDialog.close();
        };
        this.visitDialog.showModal();
    }

    renderPhotoList(photoIds, onRemove, onOpen) {
        this.photoList.innerHTML = '';
        photoIds.forEach((id) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'photo-thumb';
            const img = document.createElement('img');
            img.alt = 'Zdjęcie wizyty';
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => onOpen(id, img));
            onOpen(id, img, { previewOnly: true }).catch(() => {});
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Usuń';
            btn.addEventListener('click', async () => onRemove(id));
            wrapper.appendChild(img);
            wrapper.appendChild(btn);
            this.photoList.appendChild(wrapper);
        });
    }
}
