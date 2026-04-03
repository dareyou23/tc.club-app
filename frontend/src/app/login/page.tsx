'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Passwort vergessen
  const [showPwVergessen, setShowPwVergessen] = useState(false);
  const [pwVergessenEmail, setPwVergessenEmail] = useState('');
  const [pwVergessenSent, setPwVergessenSent] = useState(false);
  const [pwVergessenLoading, setPwVergessenLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      // Prüfe ob Passwort-Änderung erforderlich ist
      const user = JSON.parse(localStorage.getItem('training_user') || '{}');
      if (user.passwordChangeRequired || user.passwordResetRequired) {
        router.push('/passwort-aendern');
      } else {
        router.push('/');
      }
    } else {
      setError(result.error || 'Login fehlgeschlagen');
    }
  };

  const handlePwVergessen = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwVergessenLoading(true);
    await apiClient.passwortVergessen(pwVergessenEmail);
    setPwVergessenLoading(false);
    setPwVergessenSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/ClubLogo.jpg"
            alt="Club Logo"
            width={200}
            height={200}
            className="rounded-full object-cover mb-4 drop-shadow-lg"
            priority
          />
          <h1 className="text-3xl font-bold text-blue-600">Trainings-Planer</h1>
        </div>

        {!showPwVergessen ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>
              )}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  E-Mail
                </label>
                <input id="email" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} required
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="name@example.de" />
              </div>
              <div className="relative">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Passwort
                </label>
                <input id="password" type={showPassword ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)} required
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                  title={showPassword ? "Passwort verbergen" : "Passwort sehen"}>
                  🎾
                </button>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Anmelden...' : 'Anmelden'}
              </button>
            </form>
            <div className="mt-4 text-center">
              <button type="button" onClick={() => setShowPwVergessen(true)}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
                Passwort vergessen?
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {pwVergessenSent ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-green-800 font-medium mb-1">Anfrage gesendet</p>
                <p className="text-green-700 text-sm">Admin bekommt eine Mail, kann ein bisschen dauern.</p>
              </div>
            ) : (
              <form onSubmit={handlePwVergessen} className="space-y-4">
                <p className="text-sm text-gray-600">Gib deine E-Mail-Adresse ein. Ein Admin wird benachrichtigt und setzt dein Passwort zurück.</p>
                <div>
                  <label htmlFor="pw-vergessen-email" className="block text-sm font-medium text-gray-700 mb-1">
                    E-Mail
                  </label>
                  <input id="pw-vergessen-email" type="email" value={pwVergessenEmail}
                    onChange={e => setPwVergessenEmail(e.target.value)} required
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="name@example.de" />
                </div>
                <button type="submit" disabled={pwVergessenLoading}
                  className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {pwVergessenLoading ? 'Senden...' : 'Absenden'}
                </button>
              </form>
            )}
            <div className="text-center">
              <button type="button" onClick={() => { setShowPwVergessen(false); setPwVergessenSent(false); setPwVergessenEmail(''); }}
                className="text-sm text-gray-500 hover:text-gray-700 hover:underline">
                ← Zurück zum Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
