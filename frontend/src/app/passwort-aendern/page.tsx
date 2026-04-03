'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

export default function PasswortAendernPage() {
  const { currentUser, updateUser } = useAuth();
  const router = useRouter();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [telefon, setTelefon] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const isFirstLogin = currentUser?.passwordChangeRequired;
  const isPasswordReset = currentUser?.passwordResetRequired;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPw.length < 8) { setError('Passwort muss mindestens 8 Zeichen lang sein'); return; }
    if (newPw !== confirm) { setError('Passwörter stimmen nicht überein'); return; }

    if (isFirstLogin) {
      if (!email.trim() || !email.includes('@')) { setError('Bitte eine gültige E-Mail-Adresse eingeben'); return; }
      if (email.trim().toLowerCase() === currentUser?.email?.toLowerCase()) { setError('Bitte eine andere E-Mail-Adresse als die aktuelle eingeben'); return; }
      if (!telefon.trim() || telefon.trim().length < 5) { setError('Bitte eine gültige Telefonnummer eingeben'); return; }
    }

    setLoading(true);
    try {
      let res;
      if (isFirstLogin) {
        res = await apiClient.erstanmeldung(currentPw, newPw, email.trim(), telefon.trim());
      } else {
        res = await apiClient.changePassword(currentPw, newPw);
      }
      if (res.success) {
        updateUser({
          passwordChangeRequired: false,
          passwordResetRequired: false,
          ...(isFirstLogin ? { email: email.trim() } : {}),
        });
        setSuccess(true);
        setTimeout(() => router.push('/'), 2000);
      } else {
        setError(res.error || 'Fehler beim Ändern');
      }
    } catch {
      setError('Fehler beim Ändern');
    } finally {
      setLoading(false);
    }
  };

  const PasswordToggle = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
    <button type="button" onClick={onToggle}
      className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
      title={show ? "Passwort verbergen" : "Passwort sehen"}>
      🎾
    </button>
  );

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isFirstLogin ? 'Erstanmeldung abgeschlossen' : 'Passwort geändert'}
          </h1>
          <p className="text-gray-600">Weiterleitung...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isFirstLogin ? 'Willkommen! 🎾' : isPasswordReset ? 'Passwort zurückgesetzt 🔑' : 'Passwort ändern'}
          </h1>
          <p className="text-gray-600">
            {isFirstLogin
              ? 'Bitte vervollständige dein Profil bei der ersten Anmeldung'
              : isPasswordReset
              ? 'Dein Passwort wurde zurückgesetzt. Bitte vergib ein neues Passwort.'
              : 'Neues Passwort vergeben'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Bei Erstanmeldung: Email + Telefon */}
          {isFirstLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-Mail-Adresse <span className="text-red-500">*</span>
                </label>
                <input type="email" value={email}
                  onChange={e => setEmail(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="deine.echte@email.de" />
                <p className="text-xs text-gray-500 mt-1">Bitte deine echte E-Mail-Adresse eintragen</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefonnummer <span className="text-red-500">*</span>
                </label>
                <input type="tel" value={telefon}
                  onChange={e => setTelefon(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0170 1234567" />
                <p className="text-xs text-gray-500 mt-1">Für kurzfristige Absagen und Rückfragen</p>
              </div>
              <hr className="border-gray-200" />
            </>
          )}

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Aktuelles Passwort</label>
            <input type={showCurrentPw ? "text" : "password"} value={currentPw}
              onChange={e => setCurrentPw(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              placeholder="Aktuelles Passwort" />
            <PasswordToggle show={showCurrentPw} onToggle={() => setShowCurrentPw(!showCurrentPw)} />
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort</label>
            <input type={showNewPw ? "text" : "password"} value={newPw}
              onChange={e => setNewPw(e.target.value)} required minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              placeholder="Mindestens 8 Zeichen" />
            <PasswordToggle show={showNewPw} onToggle={() => setShowNewPw(!showNewPw)} />
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen</label>
            <input type={showConfirm ? "text" : "password"} value={confirm}
              onChange={e => setConfirm(e.target.value)} required minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              placeholder="Passwort wiederholen" />
            <PasswordToggle show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Wird gespeichert...' : isFirstLogin ? 'Profil speichern & loslegen' : 'Passwort ändern'}
          </button>
        </form>
      </div>
    </div>
  );
}
