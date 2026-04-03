'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import { downloadICS } from '@/lib/ics';
import ProtectedRoute from '@/components/ProtectedRoute';

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function formatDatum(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return `${WOCHENTAGE[d.getDay()]}. ${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

interface Spieltag {
  id: string; nr: number; datum: string; uhrzeit: string;
  gegner: string; heimspiel: boolean; mannschaft?: number;
  heimmannschaft?: string; gastmannschaft?: string;
}

type VerfStatus = 'ja' | 'nein' | 'vielleicht' | '';
type AllVerf = Record<string, Record<string, VerfStatus>>;

export default function MedenSpieltagePage() {
  const { currentUser } = useAuth();
  const [spieltage, setSpieltage] = useState<Spieltag[]>([]);
  const [spieler, setSpieler] = useState<any[]>([]);
  const [verf, setVerf] = useState<AllVerf>({});
  const [loaded, setLoaded] = useState(false);
  const [filterMannschaft, setFilterMannschaft] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [stRes, spRes, vRes] = await Promise.all([
        apiClient.listMedenSpieltage(),
        apiClient.listSpieler(),
        apiClient.getAllMedenVerfuegbarkeit(),
      ]);
      if (stRes.success && stRes.data) setSpieltage(stRes.data);
      if (spRes.success && spRes.data) setSpieler(spRes.data);
      if (vRes.success && vRes.data) setVerf(vRes.data as AllVerf);
      setLoaded(true);
    }
    load();
  }, []);

  const myId = currentUser?.id;

  const getStatus = (spieltagId: string, spielerId: string): VerfStatus => {
    return (verf[spieltagId]?.[spielerId] || '') as VerfStatus;
  };

  const setStatus = async (spieltagId: string, status: VerfStatus) => {
    if (!myId) return;
    // Optimistic update
    setVerf(prev => {
      const next = { ...prev };
      if (!next[spieltagId]) next[spieltagId] = {};
      next[spieltagId] = { ...next[spieltagId], [myId]: status };
      return next;
    });
    const res = await apiClient.setMedenVerfuegbarkeit(spieltagId, status);
    if (!res.success) {
      alert('Fehler beim Speichern');
    }
  };

  const getZusagen = (spieltagId: string) =>
    spieler.filter(s => getStatus(spieltagId, s.id) === 'ja').sort((a, b) => (a.setzlistePosition || 99) - (b.setzlistePosition || 99));

  const getUnsichere = (spieltagId: string) =>
    spieler.filter(s => getStatus(spieltagId, s.id) === 'vielleicht').sort((a, b) => (a.setzlistePosition || 99) - (b.setzlistePosition || 99));

  if (!loaded) return <div className="text-center py-12 text-gray-500">Laden...</div>;

  const meineKern = currentUser?.kern || null;
  const kernSpieltage = meineKern ? spieltage.filter(st => st.mannschaft === meineKern) : [];
  const andereSpieltage = meineKern ? spieltage.filter(st => st.mannschaft !== meineKern) : spieltage;

  const mannschaftLabel = (m?: number) => m ? `${m}. Mannschaft` : '';

  const renderSpieltag = (st: Spieltag) => {
    const myStatus = myId ? getStatus(st.id, myId) : '';
    const zusagen = getZusagen(st.id);
    const unsichere = getUnsichere(st.id);
    const zuWenig = zusagen.length < 6;
    const genug = zusagen.length >= 6;
    const cardClass = zuWenig ? 'bg-red-50 border-2 border-red-200' : genug ? 'bg-green-50 border-2 border-green-200' : 'bg-white';

    return (
      <div key={st.id} className={`rounded-lg shadow p-4 ${cardClass}`}>
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="font-semibold text-gray-800">{mannschaftLabel(st.mannschaft)} · {formatDatum(st.datum)} {st.uhrzeit}</p>
            <p className="text-sm text-gray-600">Nr. {st.nr} · {st.heimspiel ? '🏠 Heim' : '🚗 Auswärts'} · vs {st.gegner}</p>
          </div>
          <span className={`text-sm font-medium px-2 py-1 rounded ${zuWenig ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {zusagen.length}/6
          </span>
        </div>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => { setStatus(st.id, 'ja'); downloadICS(st); }}
            className={`flex-1 py-2 rounded text-sm font-medium transition ${myStatus === 'ja' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-100'}`}>
            ✅ Dabei
          </button>
          <button type="button" onClick={() => setStatus(st.id, 'vielleicht')}
            className={`flex-1 py-2 rounded text-sm font-medium transition ${myStatus === 'vielleicht' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-yellow-100'}`}>
            ❓ Unsicher
          </button>
          <button type="button" onClick={() => setStatus(st.id, 'nein')}
            className={`flex-1 py-2 rounded text-sm font-medium transition ${myStatus === 'nein' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-100'}`}>
            ❌ Nein
          </button>
          <button type="button" onClick={() => downloadICS(st)}
            className="py-2 px-3 rounded text-sm bg-gray-100 text-gray-600 hover:bg-blue-100" title="Kalender-Download">
            📅
          </button>
        </div>
        {zusagen.length > 0 && (
          <div className="border-t border-gray-200 pt-2">
            <p className="text-xs text-gray-500 mb-1">Dabei ({zusagen.length}):</p>
            <p className="text-sm text-gray-700">{zusagen.map(s => `${s.vorname} ${s.name}`).join(', ')}</p>
          </div>
        )}
        {unsichere.length > 0 && (
          <div className="mt-1">
            <p className="text-xs text-gray-400">Unsicher: {unsichere.map(s => `${s.vorname} ${s.name}`).join(', ')}</p>
          </div>
        )}
      </div>
    );
  };

  const filtered = spieltage.filter(st => filterMannschaft === null || st.mannschaft === filterMannschaft);
  const kernFiltered = meineKern ? filtered.filter(st => st.mannschaft === meineKern) : [];
  const andereFiltered = meineKern ? filtered.filter(st => st.mannschaft !== meineKern) : filtered;

  return (
    <ProtectedRoute>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">Meden-Spieltage</h2>
          <div className="flex gap-1">
            {[null, 1, 2, 3, 4].map(m => (
              <button key={m ?? 'alle'} type="button"
                onClick={() => setFilterMannschaft(m)}
                className={`px-3 py-1 rounded text-xs font-medium ${filterMannschaft === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {m === null ? 'Alle' : `M${m}`}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-gray-600">Klicke auf deinen Status für jeden Spieltag.</p>

        {kernFiltered.length > 0 && (
          <>
            <h3 className="text-sm font-bold text-blue-700 mt-2">Meine Mannschaft ({mannschaftLabel(meineKern!)})</h3>
            {kernFiltered.map(renderSpieltag)}
          </>
        )}

        {kernFiltered.length > 0 && andereFiltered.length > 0 && (
          <hr className="border-t-4 border-gray-800 my-4" />
        )}

        {andereFiltered.length > 0 && (
          <>
            {meineKern && <h3 className="text-sm font-bold text-gray-500">Weitere Mannschaften</h3>}
            {andereFiltered.map(renderSpieltag)}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
