'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function BenachrichtigungenPage() {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [plaetze, setPlaetze] = useState<any[]>([]);

  // Nachricht senden Form
  const [showSendForm, setShowSendForm] = useState(false);
  const [sendPlatzId, setSendPlatzId] = useState('');
  const [sendTitel, setSendTitel] = useState('');
  const [sendNachricht, setSendNachricht] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');

  const isVerwalter = currentUser?.rolle === 'trainings_verwalter' || currentUser?.rolle === 'admin';

  useEffect(() => {
    loadItems();
    if (isVerwalter) loadPlaetze();
  }, []);

  async function loadItems() {
    const res = await apiClient.getBenachrichtigungen();
    if (res.success && res.data) setItems(res.data);
    setLoading(false);
  }

  async function loadPlaetze() {
    const res = await apiClient.listPlaetze();
    if (res.success && res.data) setPlaetze(res.data);
  }

  async function handleMarkGelesen(sk: string) {
    await apiClient.markGelesen(sk);
    setItems(prev => prev.map(n => n.SK === sk ? { ...n, gelesen: true } : n));
  }

  async function handleAlleGelesen() {
    const unread = items.filter(n => !n.gelesen);
    for (const n of unread) {
      await apiClient.markGelesen(n.SK);
    }
    setItems(prev => prev.map(n => ({ ...n, gelesen: true })));
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setSendResult('');
    const res = await apiClient.sendNachricht(sendPlatzId, sendTitel, sendNachricht);
    setSending(false);
    if (res.success) {
      setSendResult(res.data?.message || 'Gesendet');
      setSendTitel('');
      setSendNachricht('');
      setSendPlatzId('');
      setShowSendForm(false);
    } else {
      setSendResult(res.error || 'Fehler beim Senden');
    }
  }

  const unreadCount = items.filter(n => !n.gelesen).length;

  return (
    <ProtectedRoute>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">
          Benachrichtigungen
          {unreadCount > 0 && <span className="ml-2 text-sm bg-red-500 text-white rounded-full px-2 py-0.5">{unreadCount} neu</span>}
        </h1>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button type="button" onClick={handleAlleGelesen}
              className="text-sm text-blue-600 hover:text-blue-800">
              Alle gelesen
            </button>
          )}
          {isVerwalter && (
            <button type="button" onClick={() => setShowSendForm(!showSendForm)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
              {showSendForm ? 'Abbrechen' : '📢 Nachricht senden'}
            </button>
          )}
        </div>
      </div>

      {sendResult && (
        <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
          {sendResult}
        </div>
      )}

      {showSendForm && (
        <form onSubmit={handleSend} className="bg-white rounded-lg shadow p-4 mb-4 space-y-3">
          <h3 className="font-semibold">Nachricht an Trainingsrunde</h3>
          <select value={sendPlatzId} onChange={e => setSendPlatzId(e.target.value)} required
            aria-label="Trainingsrunde wählen"
            className="w-full px-3 py-2 border rounded text-sm">
            <option value="">Trainingsrunde wählen...</option>
            {plaetze.map(p => (
              <option key={p.id || p.SK} value={p.id || p.SK?.replace('META', '').replace('#', '')}>
                {p.name}
              </option>
            ))}
          </select>
          <input placeholder="Betreff" value={sendTitel} required maxLength={200}
            onChange={e => setSendTitel(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm" />
          <textarea placeholder="Nachricht..." value={sendNachricht} required maxLength={2000} rows={3}
            onChange={e => setSendNachricht(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm" />
          <button type="submit" disabled={sending}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {sending ? 'Senden...' : 'Senden'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500">Laden...</p>
      ) : items.length === 0 ? (
        <p className="text-gray-500">Keine Benachrichtigungen.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n, i) => (
            <div key={i} className={`bg-white rounded-lg shadow p-4 border-l-4 ${
              n.gelesen ? 'border-gray-300' : 'border-red-500'
            }`}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${n.gelesen ? 'text-gray-600' : 'text-gray-900'}`}>{n.titel}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{n.nachricht}</p>
                </div>
                <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                  <span className="text-xs text-gray-400">
                    {new Date(n.createdAt).toLocaleDateString('de-DE')}
                  </span>
                  {!n.gelesen && (
                    <button type="button" onClick={() => handleMarkGelesen(n.SK)}
                      className="text-xs text-blue-600 hover:text-blue-800">
                      ✓ gelesen
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ProtectedRoute>
  );
}
