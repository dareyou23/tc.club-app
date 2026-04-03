import { ApiResponse, TrainingUser } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('training_token');
      this.refreshToken = localStorage.getItem('training_refresh_token');
      const exp = localStorage.getItem('training_token_expires_at');
      this.tokenExpiresAt = exp ? parseInt(exp) : 0;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
      if (!response.ok) {
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          return { success: false, error: `HTTP ${response.status}: ${text}` };
        }
      }
      return response.json();
    } catch (err: any) {
      console.error(`API request failed: ${endpoint}`, err);
      return { success: false, error: `Netzwerkfehler: ${err.message || 'Verbindung fehlgeschlagen'}` };
    }
  }

  async login(email: string, password: string): Promise<ApiResponse<{
    accessToken: string; refreshToken: string; expiresIn: number; user: TrainingUser;
  }>> {
    const res = await this.request<{
      accessToken: string; refreshToken: string; expiresIn: number; user: TrainingUser;
    }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

    if (res.success && res.data) {
      this.token = res.data.accessToken;
      this.refreshToken = res.data.refreshToken;
      this.tokenExpiresAt = Date.now() + (res.data.expiresIn * 1000);
      if (typeof window !== 'undefined') {
        localStorage.setItem('training_token', this.token);
        localStorage.setItem('training_refresh_token', this.refreshToken);
        localStorage.setItem('training_token_expires_at', this.tokenExpiresAt.toString());
        localStorage.setItem('training_user', JSON.stringify(res.data.user));
      }
    }
    return res;
  }

  async logout(): Promise<void> {
    try { await this.request('/auth/logout', { method: 'POST' }); } catch {}
    this.token = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('training_token');
      localStorage.removeItem('training_refresh_token');
      localStorage.removeItem('training_token_expires_at');
      localStorage.removeItem('training_user');
    }
  }

  getUser(): TrainingUser | null {
    if (typeof window === 'undefined') return null;
    const s = localStorage.getItem('training_user');
    return s ? JSON.parse(s) : null;
  }

  isAuthenticated(): boolean { return this.token !== null; }

  setTokenAndUser(token: string, expiresIn: number, user: TrainingUser) {
    this.token = token;
    this.tokenExpiresAt = Date.now() + (expiresIn * 1000);
    if (typeof window !== 'undefined') {
      localStorage.setItem('training_token', token);
      localStorage.setItem('training_token_expires_at', this.tokenExpiresAt.toString());
      localStorage.setItem('training_user', JSON.stringify(user));
    }
  }

  // Saisons
  async listSaisons() { return this.request<any[]>('/saisons'); }
  async getAktiveSaison() { return this.request<any>('/saisons/aktiv'); }
  async createSaison(data: any) { return this.request<any>('/saisons', { method: 'POST', body: JSON.stringify(data) }); }
  async ensureSaisons() { return this.request<any[]>('/saisons/ensure', { method: 'POST' }); }

  // Plätze
  async listPlaetze() { return this.request<any[]>('/plaetze'); }
  async getPlatz(id: string) { return this.request<any>(`/plaetze/${id}`); }
  async createPlatz(data: any) { return this.request<any>('/plaetze', { method: 'POST', body: JSON.stringify(data) }); }
  async updatePlatz(id: string, data: any) { return this.request<any>(`/plaetze/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deletePlatz(id: string) { return this.request<any>(`/plaetze/${id}`, { method: 'DELETE' }); }
  async getPlatzSlots(platzId: string) { return this.request<any[]>(`/plaetze/${platzId}/slots`); }

  // Buchungsgruppe
  async getGruppe(platzId: string) { return this.request<any[]>(`/plaetze/${platzId}/gruppe`); }
  async addToGruppe(platzId: string, spielerId: string) {
    return this.request<any>(`/plaetze/${platzId}/gruppe`, { method: 'POST', body: JSON.stringify({ spielerId }) });
  }
  async removeFromGruppe(platzId: string, spielerId: string) {
    return this.request<any>(`/plaetze/${platzId}/gruppe/${spielerId}`, { method: 'DELETE' });
  }

  // Verfügbarkeit
  async getSlotVerfuegbarkeit(slotId: string) { return this.request<any[]>(`/slots/${slotId}/verfuegbarkeit`); }
  async setVerfuegbarkeit(slotId: string, status: string) {
    return this.request<any>(`/verfuegbarkeit/${slotId}`, { method: 'PUT', body: JSON.stringify({ status }) });
  }

  // Zuweisungen
  async berechneZuweisung(slotId: string) {
    return this.request<any>('/zuweisungen/berechnen', { method: 'POST', body: JSON.stringify({ slotId }) });
  }
  async getSlotZuweisungen(slotId: string) { return this.request<any[]>(`/slots/${slotId}/zuweisungen`); }
  async toggleZuweisung(slotId: string, spielerId: string) {
    return this.request<any>(`/slots/${slotId}/zuweisungen/${spielerId}`, { method: 'PUT' });
  }
  async schliesseSlotAb(slotId: string) { return this.request<any>(`/slots/${slotId}/abschliessen`, { method: 'POST' }); }

  // Spontan-Anmeldung
  async anmelden(slotId: string, halb = false) {
    const path = halb ? `/slots/${slotId}/anmelden/halb` : `/slots/${slotId}/anmelden`;
    return this.request<any>(path, { method: 'POST' });
  }
  async abmelden(slotId: string) { return this.request<any>(`/slots/${slotId}/anmelden`, { method: 'DELETE' }); }

  // Spieler
  async listSpieler() { return this.request<any[]>('/spieler'); }
  async createSpieler(data: any) { return this.request<any>('/spieler', { method: 'POST', body: JSON.stringify(data) }); }
  async updateSpieler(id: string, data: any) { return this.request<any>(`/spieler/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteSpieler(id: string) { return this.request<any>(`/spieler/${id}`, { method: 'DELETE' }); }
  async setPassword(spielerId: string, password: string) {
    return this.request<any>(`/spieler/${spielerId}`, { method: 'PUT', body: JSON.stringify({ password }) });
  }
  async resetPassword(email: string) {
    return this.request<{ temporaryPassword: string; email: string }>('/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ email }),
    });
  }

  // Kosten
  async getMeinKostenkonto() { return this.request<any[]>('/kosten/mein-konto'); }
  async getGruppenKosten(platzId: string) { return this.request<any[]>(`/kosten/gruppe/${platzId}`); }

  // Benachrichtigungen
  async getBenachrichtigungen() { return this.request<any[]>('/benachrichtigungen'); }
  async getUnreadCount() { return this.request<{ count: number }>('/benachrichtigungen/ungelesen/count'); }
  async markGelesen(sk: string) {
    return this.request<any>('/benachrichtigungen/gelesen', { method: 'PUT', body: JSON.stringify({ sk }) });
  }
  async sendNachricht(platzId: string, titel: string, nachricht: string) {
    return this.request<any>('/benachrichtigungen/senden', {
      method: 'POST', body: JSON.stringify({ platzId, titel, nachricht }),
    });
  }

  // Passwort
  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<any>('/auth/change-password', {
      method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Profil
  async getProfil() { return this.request<any>('/profil'); }
  async updateProfil(email: string, telefon: string) {
    return this.request<any>('/profil', { method: 'PUT', body: JSON.stringify({ email, telefon }) });
  }

  // Erstanmeldung (Passwort + Email + Telefon)
  async erstanmeldung(currentPassword: string, newPassword: string, email: string, telefon: string) {
    return this.request<any>('/auth/erstanmeldung', {
      method: 'POST', body: JSON.stringify({ currentPassword, newPassword, email, telefon }),
    });
  }

  // Impersonate
  async impersonate(spielerId: string) {
    return this.request<{
      accessToken: string; expiresIn: number; user: TrainingUser;
    }>('/auth/impersonate', { method: 'POST', body: JSON.stringify({ spielerId }) });
  }

  // Passwort vergessen (öffentlich, kein Auth)
  async passwortVergessen(email: string) {
    return this.request<any>('/auth/passwort-vergessen', {
      method: 'POST', body: JSON.stringify({ email }),
    });
  }

  // --- Meden ---
  async listMedenSpieltage() { return this.request<any[]>('/meden/spieltage'); }
  async getAllMedenVerfuegbarkeit() { return this.request<Record<string, Record<string, string>>>('/meden/verfuegbarkeit/alle'); }
  async setMedenVerfuegbarkeit(spieltagId: string, status: string) {
    return this.request<any>('/meden/verfuegbarkeit', {
      method: 'POST', body: JSON.stringify({ spieltagId, status }),
    });
  }

  async getAufstellung(spieltagId: string) { return this.request<any[]>(`/meden/aufstellung/${spieltagId}`); }
  async setAufstellung(spieltagId: string, spielerIds: string[]) {
    return this.request<any>(`/meden/aufstellung/${spieltagId}`, {
      method: 'POST', body: JSON.stringify({ spielerIds }),
    });
  }
  async getFestspielStatus() { return this.request<any[]>('/meden/festspiel-status'); }
}

export const apiClient = new ApiClient();
