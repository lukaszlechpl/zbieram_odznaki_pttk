const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email openid';

export class GoogleAuth {
    constructor({ clientId }) {
        this.clientId = clientId;
        this.tokenClient = null;
        this.accessToken = '';
        this.user = null;
    }

    setClientId(clientId) {
        this.clientId = String(clientId || '').trim();
    }

    isConfigured() {
        return Boolean(this.clientId);
    }

    isLoggedIn() {
        return Boolean(this.accessToken);
    }

    async init() {
        if (!this.isConfigured() || !window.google?.accounts?.oauth2) return;
        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: SCOPES,
            callback: () => {}
        });
    }

    async signIn() {
        return this.requestAccessToken({ prompt: 'consent' });
    }

    async trySilentSignIn() {
        try {
            return await this.requestAccessToken({ prompt: '' });
        } catch {
            return null;
        }
    }

    async requestAccessToken({ prompt }) {
        if (!this.tokenClient) throw new Error('Google Auth nie jest skonfigurowane');
        const tokenResponse = await new Promise((resolve, reject) => {
            this.tokenClient.callback = (resp) => {
                if (resp.error) {
                    reject(new Error(resp.error));
                    return;
                }
                resolve(resp);
            };
            this.tokenClient.requestAccessToken({ prompt });
        });
        this.accessToken = tokenResponse.access_token;
        this.user = await this.fetchUser();
        return this.user;
    }

    async fetchUser() {
        if (!this.accessToken) return null;
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (!response.ok) return null;
        const json = await response.json();
        return { name: json.name || json.email || 'Użytkownik Google', email: json.email || '' };
    }

    signOut() {
        if (!this.accessToken) return;
        if (window.google?.accounts?.oauth2?.revoke) {
            window.google.accounts.oauth2.revoke(this.accessToken, () => {});
        }
        this.accessToken = '';
        this.user = null;
    }
}
