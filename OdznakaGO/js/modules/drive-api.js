const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

async function request(accessToken, url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {})
        }
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Drive API error (${response.status}): ${text}`);
    }
    return response;
}

export async function findFileByName(accessToken, name, parentId = 'appDataFolder') {
    const q = encodeURIComponent(`name='${name.replaceAll("'", "\\'")}' and '${parentId}' in parents and trashed=false`);
    const url = `${DRIVE_API}?spaces=appDataFolder&q=${q}&fields=files(id,name,mimeType)`;
    const response = await request(accessToken, url);
    const json = await response.json();
    return json.files?.[0] || null;
}

export async function ensureFolder(accessToken, name) {
    const existing = await findFileByName(accessToken, name);
    if (existing) return existing.id;
    const response = await request(accessToken, DRIVE_API + '?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['appDataFolder']
        })
    });
    const created = await response.json();
    return created.id;
}

export async function upsertJson(accessToken, name, content, parentId = 'appDataFolder') {
    const existing = await findFileByName(accessToken, name, parentId);
    const metadata = existing
        ? {}
        : { name, parents: [parentId], mimeType: 'application/json' };
    const boundary = 'odznakago-boundary';
    const body =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${JSON.stringify(content)}\r\n` +
        `--${boundary}--`;
    const base = existing ? `${UPLOAD_API}/${existing.id}` : UPLOAD_API;
    const method = existing ? 'PATCH' : 'POST';
    const response = await request(accessToken, `${base}?uploadType=multipart&fields=id`, {
        method,
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
    });
    return response.json();
}

export async function readJson(accessToken, name, parentId = 'appDataFolder') {
    const file = await findFileByName(accessToken, name, parentId);
    if (!file) return null;
    const response = await request(accessToken, `${DRIVE_API}/${file.id}?alt=media`);
    return response.json();
}

export async function uploadBlob(accessToken, folderId, name, blob) {
    const boundary = 'odznakago-upload';
    const metadata = { name, parents: [folderId] };
    const multipartBody = new Blob([
        `--${boundary}\r\n`,
        'Content-Type: application/json; charset=UTF-8\r\n\r\n',
        `${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\n`,
        `Content-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
        blob,
        '\r\n',
        `--${boundary}--`
    ]);
    const response = await request(accessToken, `${UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartBody
    });
    return response.json();
}

export async function deleteFile(accessToken, fileId) {
    await request(accessToken, `${DRIVE_API}/${fileId}`, { method: 'DELETE' });
}

export async function fetchBlob(accessToken, fileId) {
    const response = await request(accessToken, `${DRIVE_API}/${fileId}?alt=media`);
    return response.blob();
}
