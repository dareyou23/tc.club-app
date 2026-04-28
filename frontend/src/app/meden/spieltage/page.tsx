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

  const getStatus = (spieltagId: string, spielerId: string): VerfStatus =>
    (verf[spieltagId]?.[spielerId] || '') as VerfStatus;

  const setStatus = async (spieltagId: string, status: VerfStatus) => {
    if (!myId) return;
    setVerf(prev => {
      const next = { ...prev };
      if (!next[spieltagId]) next[spieltagId] = {};
      next[spieltagId] = { ...next[spieltagId], [myId]: status };
      return next;
    });
    const res = await apiClient.setMedenVerfuegbarkeit(spieltagId, status);
    if (!res.success) alert('Fehler beim Speichern');
  };

  const getZusagen = (spieltagId: string) =>
    spieler.filter(s => getStatus(spieltagId, s.id) === 'ja').sort((a, b) => (a.setzlistePosition || 99) - (b.setzlistePosition || 99));

  const getUnsichere = (spieltagId: string) =>
    spieler.filter(s => getStatus(spieltagId, s.id) === 'vielleicht').sort((a, b) => (a.setzlistePosition || 99) - (b.setzlistePosition || 99));

  if (!loaded) return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  const meineKern = currentUser?.kern || null;
  const mannschaftLabel = (m?: number) => m ? `${m}. Mannschaft` : '';

  const renderSpieltag = (st: Spieltag) => {
    const myStatus = myId ? getStatus(st.id, myId) : '';
    const zusagen = getZusagen(st.id);
    const unsichere = getUnsichere(st.id);
    const zuWenig = zusagen.length < 6;

    const borderColor = zuWenig ? 'border-red-400' : 'border-emerald-400';
    const countBadge = zuWenig
      ? 'bg-red-100 text-red-700'
      : 'bg-emerald-100 text-emerald-700';

    return (
      <div key={st.id} className={`card-accent p-5 ${borderColor}`}>
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge bg-blue-100 text-blue-700">M{st.mannschaft}</span>
              <span className="text-xs text-gray-400">Nr. {st.nr}</span>
            </div>
            <p className="font-semibold text-gray-900">{formatDatum(st.datum)} · {st.uhrzeit}</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {st.heimspiel ? '🏠 Heim' : '🚗 Auswärts'} vs {st.gegner}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge ${countBadge} text-base`}>
              {zusagen.length}/6
            </span>
            <button type="button" onClick={() => downloadICS(st)}
              className="p-2 rounded-lg bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              title="Kalender-Download">
              📅
            </button>
          </div>
        </div>

        {/* Status-Buttons */}
        <div className="flex gap-2 mb-4">
          {([
            { value: 'ja' as VerfStatus, label: '✅ Dabei', active: 'bg-emerald-600 text-white shadow-sm', inactive: 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' },
            { value: 'vielleicht' as VerfStatus, label: '❓ Unsicher', active: 'bg-amber-500 text-white shadow-sm', inactive: 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100' },
            { value: 'nein' as VerfStatus, label: '❌ Nein', active: 'bg-red-600 text-white shadow-sm', inactive: 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100' },
          ]).map(btn => (
            <button key={btn.value} type="button"
              onClick={() => { setStatus(st.id, btn.value); if (btn.value === 'ja') downloadICS(st); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
                myStatus === btn.value ? btn.active : btn.inactive
              }`}>
              {btn.label}
            </button>
          ))}
        </div>

        {/* Zusagen */}
        {zusagen.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="section-title mb-2">Dabei ({zusagen.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {zusagen.map(s => (
                <span key={s.id} className="badge bg-emerald-50 text-emerald-700">
                  {s.vorname} {s.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Unsichere */}
        {unsichere.length > 0 && (
          <div className="mt-3">
            <p className="section-title mb-2">Unsicher ({unsichere.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {unsichere.map(s => (
                <span key={s.id} className="badge bg-amber-50 text-amber-600">
                  {s.vorname} {s.name}
                </span>
              ))}
            </div>
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
      <div className="space-y-6">
        {/* Header + Filter */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meden-Spieltage</h1>
            <p className="text-gray-500 mt-1">Klicke auf deinen Status für jeden Spieltag</p>
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {[null, 1, 2, 3, 4].map(m => (
              <button key={m ?? 'alle'} type="button"
                onClick={() => setFilterMannschaft(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filterMannschaft === m
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                {m === null ? 'Alle' : `M${m}`}
              </button>
            ))}
          </div>
        </div>

        {/* Meine Mannschaft */}
        {kernFiltered.length > 0 && (
          <section>
            <p className="section-title mb-3">🎾 Meine Mannschaft ({mannschaftLabel(meineKern!)})</p>
            <div className="space-y-4">
              {kernFiltered.map(renderSpieltag)}
            </div>
          </section>
        )}

        {/* Trennlinie */}
        {kernFiltered.length > 0 && andereFiltered.length > 0 && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center">
              <span className="bg-[#f8fafc] px-4 text-xs text-gray-400 uppercase tracking-wider">Weitere Mannschaften</span>
            </div>
          </div>
        )}

        {/* Andere Mannschaften */}
        {andereFiltered.length > 0 && (
          <section>
            {!meineKern && <p className="section-title mb-3">Alle Spieltage</p>}
            <div className="space-y-4">
              {andereFiltered.map(renderSpieltag)}
            </div>
          </section>
        )}
      </div>
    </ProtectedRoute>
  );
}
