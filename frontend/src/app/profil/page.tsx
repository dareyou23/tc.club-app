'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function ProfilPage() {
  const { currentUser, updateUser } = useAuth();
  const [email, setEmail] = useState('');
  const [telefon, setTelefon] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profilMsg, setProfilMsg] = useState('');
  const [profilError, setProfilError] = useState('');

  // Passwort-Felder
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    loadProfil();
  }, []);

  async function loadProfil() {
    const res = await apiClient.getProfil();
    if (res.success && res.data) {
      setEmail(res.data.email || '');
      setTelefon(res.data.telefon || '');
    }
    setLoading(false);
  }

  async function handleProfilSave(e: React.FormEvent) {
    e.preventDefault();
    setProfilMsg(''); setProfilError('');
    if (!email.trim() || !email.includes('@')) { setProfilError('Bitte eine gültige E-Mail eingeben'); return; }
    if (!telefon.trim() || telefon.trim().length < 5) { setProfilError('Bitte eine gültige Telefonnummer eingeben'); return; }

    setSaving(true);
    const res = await apiClient.updateProfil(email.trim(), telefon.trim());
    setSaving(false);
    if (res.success) {
      setProfilMsg('Profil gespeichert');
      updateUser({ email: email.trim() });
      setTimeout(() => setProfilMsg(''), 3000);
    } else {
      setProfilError(res.error || 'Fehler beim Speichern');
    }
  }

  async function handlePwChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(''); setPwError('');
    if (newPw.length < 8) { setPwError('Mindestens 8 Zeichen'); return; }
    if (newPw !== confirmPw) { setPwError('Passwörter stimmen nicht überein'); return; }

    setPwSaving(true);
    const res = await apiClient.changePassword(currentPw, newPw);
    setPwSaving(false);
    if (res.success) {
      setPwMsg('Passwort geändert');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setPwMsg(''), 3000);
    } else {
      setPwError(res.error || 'Fehler beim Ändern');
    }
  }

  return (
    <ProtectedRoute>
      <h1 className="text-2xl font-bold mb-6">Mein Profil</h1>

      {loading ? (
        <p className="text-gray-500">Laden...</p>
      ) : (
        <div className="max-w-md space-y-6">
          {/* Info */}
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Angemeldet als</p>
            <p className="font-semibold text-lg">{currentUser?.vorname} {currentUser?.name}</p>
            <p className="text-sm text-gray-500 capitalize">{currentUser?.rolle}</p>
          </div>

          {/* Kontaktdaten */}
          <form onSubmit={handleProfilSave} className="bg-white rounded-lg shadow p-4 space-y-4">
            <h2 className="font-semibold text-lg">Kontaktdaten</h2>
            <div>
              <label htmlFor="profil-email" className="block text-sm font-medium text-gray-700 mb-1">E-Mail-Adresse</label>
              <input id="profil-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="profil-telefon" className="block text-sm font-medium text-gray-700 mb-1">Telefonnummer</label>
              <input id="profil-telefon" type="tel" value={telefon} onChange={e => setTelefon(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0170 1234567" />
            </div>
            {profilError && <p className="text-red-600 text-sm">{profilError}</p>}
            {profilMsg && <p className="text-green-600 text-sm">{profilMsg}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Speichern...' : 'Kontaktdaten speichern'}
            </button>
          </form>

          {/* Passwort ändern */}
          <form onSubmit={handlePwChange} className="bg-white rounded-lg shadow p-4 space-y-4">
            <h2 className="font-semibold text-lg">Passwort ändern</h2>
            <div>
              <label htmlFor="pw-current" className="block text-sm font-medium text-gray-700 mb-1">Aktuelles Passwort</label>
              <input id="pw-current" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="pw-new" className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort</label>
              <input id="pw-new" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mindestens 8 Zeichen" />
            </div>
            <div>
              <label htmlFor="pw-confirm" className="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen</label>
              <input id="pw-confirm" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {pwError && <p className="text-red-600 text-sm">{pwError}</p>}
            {pwMsg && <p className="text-green-600 text-sm">{pwMsg}</p>}
            <button type="submit" disabled={pwSaving}
              className="w-full bg-gray-800 text-white py-2 rounded-md hover:bg-gray-900 disabled:opacity-50">
              {pwSaving ? 'Ändern...' : 'Passwort ändern'}
            </button>
          </form>
        </div>
      )}
    </ProtectedRoute>
  );
}
