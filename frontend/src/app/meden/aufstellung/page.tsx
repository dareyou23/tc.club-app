'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

interface Spieltag {
  id: string; nr: number; datum: string; uhrzeit: string;
  gegner: string; heimspiel: boolean; mannschaft: number;
}

function getStammM(rang?: number): number {
  if (!rang || rang < 1) return 4;
  if (rang <= 6) return 1;
  if (rang <= 12) return 2;
  if (rang <= 18) return 3;
  return 4;
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function formatDatum(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return `${WOCHENTAGE[d.getDay()]} ${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

function isPast(datum: string): boolean {
  return datum < new Date().toISOString().split('T')[0];
}

export default function AufstellungPage() {
  const { currentUser } = useAuth();
  const isMF = currentUser?.mannschaftsfuehrer === true;
  const isVerwalter = currentUser?.rolle === 'trainings_verwalter' || currentUser?.rolle === 'admin';
  const meineKern = currentUser?.kern || null;

  const [spieltage, setSpieltage] = useState<Spieltag[]>([]);
  const [spieler, setSpieler] = useState<any[]>([]);
  const [selectedSt, setSelectedSt] = useState<string>('');
  const [aufstellung, setAufstellung] = useState<string[]>([]);
  const [warnungen, setWarnungen] = useState<string[]>([]);
  const [verf, setVerf] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const [stRes, spRes, vRes] = await Promise.all([
        apiClient.listMedenSpieltage(),
        apiClient.listSpieler(),
        apiClient.getAllMedenVerfuegbarkeit(),
      ]);
      if (stRes.success && stRes.data) setSpieltage(stRes.data);
      if (spRes.success && spRes.data) setSpieler(spRes.data);
      if (vRes.success && vRes.data) setVerf(vRes.data as any);
      setLoaded(true);
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedSt) { setAufstellung([]); setWarnungen([]); return; }
    apiClient.getAufstellung(selectedSt).then(res => {
      if (res.success && res.data) setAufstellung(res.data.map((a: any) => a.spielerId));
      else setAufstellung([]);
    });
  }, [selectedSt]);

  const toggleSpieler = (id: string) => {
    setAufstellung(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!selectedSt) return;
    setSaving(true);
    const res = await apiClient.setAufstellung(selectedSt, aufstellung);
    setSaving(false);
    if (res.success && res.data) setWarnungen(res.data.warnungen || []);
  };

  if (!loaded) return <div className="text-center py-12 text-gray-500">Laden...</div>;
  if (!isMF && !isVerwalter) {
    return <ProtectedRoute allowedRoles={['trainings_verwalter', 'admin']}><div /></ProtectedRoute>;
  }

  const kernSt = meineKern ? spieltage.filter(s => s.mannschaft === meineKern) : [];
  const andereSt = meineKern ? spieltage.filter(s => s.mannschaft !== meineKern) : spieltage;
  const st = spieltage.find(s => s.id === selectedSt);
  const stMannschaft = st?.mannschaft || 0;
  const verfForSt = verf[selectedSt] || {};
  const sortedSpieler = [...spieler]
    .filter(s => s.setzlistePosition && s.setzlistePosition > 0)
    .sort((a: any, b: any) => (a.setzlistePosition || 99) - (b.setzlistePosition || 99));

  const renderSpieltagButton = (s: Spieltag) => {
    const past = isPast(s.datum);
    const active = selectedSt === s.id;
    return (
      <button key={s.id} type="button" onClick={() => setSelectedSt(active ? '' : s.id)}
        className={`w-full text-left px-3 py-2 rounded border text-sm ${
          active ? 'bg-blue-100 border-blue-500 font-medium' :
          past ? 'bg-gray-50 text-gray-400 border-gray-200' :
          'bg-white border-gray-200 hover:bg-blue-50'
        }`}>
        <span className="font-semibold">{s.mannschaft}. Mannschaft</span> · {formatDatum(s.datum)} {s.uhrzeit} · {s.heimspiel ? '🏠' : '🚗'} vs {s.gegner}
      </button>
    );
  };

  return (
    <ProtectedRoute>
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-800">Aufstellung</h2>

        {kernSt.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-blue-700 mb-2">Meine Mannschaft ({meineKern}. Mannschaft)</h3>
            <div className="space-y-1">{kernSt.map(renderSpieltagButton)}</div>
          </div>
        )}

        {kernSt.length > 0 && andereSt.length > 0 && (
          <hr className="border-t-2 border-gray-300 my-2" />
        )}

        {andereSt.length > 0 && (
          <div>
            {meineKern && <h3 className="text-sm font-bold text-gray-500 mb-2">Weitere Mannschaften</h3>}
            <div className="space-y-1">{andereSt.map(renderSpieltagButton)}</div>
          </div>
        )}

        {selectedSt && (
          <div className="mt-4 pt-4 border-t-2 border-blue-300">
            <h3 className="font-bold text-gray-800 mb-2">
              {st?.mannschaft}. Mannschaft · {st && formatDatum(st.datum)} vs {st?.gegner}
            </h3>

            {warnungen.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-3 space-y-1">
                {warnungen.map((w, i) => <p key={i} className="text-sm">{w}</p>)}
              </div>
            )}

            <p className="text-sm text-gray-600 mb-2">
              Aufgestellt: {aufstellung.length} Spieler · Klicke um hinzuzufügen/entfernen
            </p>

            <div className="space-y-1">
              {sortedSpieler.map(s => {
                const stammM = getStammM(s.setzlistePosition);
                const isSelected = aufstellung.includes(s.id);
                const verfStatus = verfForSt[s.id] || '';
                const isAushelfen = stMannschaft < stammM;
                let bgClass = 'bg-white';
                if (isSelected) bgClass = 'bg-blue-100 border-blue-400';
                else if (verfStatus === 'ja') bgClass = 'bg-green-50';
                else if (verfStatus === 'vielleicht') bgClass = 'bg-yellow-50';
                else if (verfStatus === 'nein') bgClass = 'bg-red-50 opacity-50';

                return (
                  <button key={s.id} type="button" onClick={() => toggleSpieler(s.id)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm flex justify-between items-center ${bgClass}`}>
                    <div>
                      <span className="font-medium">{s.vorname} {s.name}</span>
                      <span className="text-gray-400 ml-2">Ra.{s.setzlistePosition} · LK{s.lk ? Number(s.lk).toFixed(1) : '?'}</span>
                      {isAushelfen && <span className="ml-2 text-orange-600 text-xs">↑ Aushilfe (Stamm: M{stammM})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {verfStatus === 'ja' && <span className="text-green-600 text-xs">✅</span>}
                      {verfStatus === 'vielleicht' && <span className="text-yellow-600 text-xs">❓</span>}
                      {verfStatus === 'nein' && <span className="text-red-600 text-xs">❌</span>}
                      {isSelected && <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded">Aufgestellt</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <button type="button" onClick={handleSave} disabled={saving || aufstellung.length === 0}
              className="w-full mt-3 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Speichern...' : `Aufstellung speichern (${aufstellung.length} Spieler)`}
            </button>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
