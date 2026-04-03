'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

const STATUS_ICON: Record<string, string> = { ja: '✅', nein: '❌', vielleicht: '❓', '': '—' };
const STATUS_BG: Record<string, string> = { ja: 'bg-green-100', nein: 'bg-red-100', vielleicht: 'bg-yellow-100', '': '' };

function formatKurz(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.`;
}

function getStammM(rang?: number): number {
  if (!rang || rang < 1) return 4;
  if (rang <= 6) return 1;
  if (rang <= 12) return 2;
  if (rang <= 18) return 3;
  return 4;
}

type AllVerf = Record<string, Record<string, string>>;

export default function MatrixPage() {
  const { currentUser } = useAuth();
  const [spieltage, setSpieltage] = useState<any[]>([]);
  const [spieler, setSpieler] = useState<any[]>([]);
  const [verf, setVerf] = useState<AllVerf>({});
  const [loaded, setLoaded] = useState(false);
  const [filterM, setFilterM] = useState<number | null>(null);
  const [festspielMap, setFestspielMap] = useState<Record<string, { festgespielt: boolean; festgespieltIn: number[] }>>({});

  const isMF = currentUser?.mannschaftsfuehrer === true;
  const isVerwalter = currentUser?.rolle === 'trainings_verwalter' || currentUser?.rolle === 'admin';

  useEffect(() => {
    async function load() {
      const [stRes, spRes, vRes, fsRes] = await Promise.all([
        apiClient.listMedenSpieltage(),
        apiClient.listSpieler(),
        apiClient.getAllMedenVerfuegbarkeit(),
        apiClient.getFestspielStatus(),
      ]);
      if (stRes.success && stRes.data) setSpieltage(stRes.data);
      if (spRes.success && spRes.data) setSpieler(spRes.data);
      if (vRes.success && vRes.data) setVerf(vRes.data as AllVerf);
      if (fsRes.success && fsRes.data) {
        const map: Record<string, { festgespielt: boolean; festgespieltIn: number[] }> = {};
        for (const fs of fsRes.data) {
          if (fs.mannschaften?.length > 0) {
            map[fs.spielerId] = { festgespielt: fs.festgespielt, festgespieltIn: fs.festgespieltIn || [] };
          }
        }
        setFestspielMap(map);
      }
      // MF sieht standardmäßig alle Mannschaften (Kernmannschaft oben durch Sortierung)
      setLoaded(true);
    }
    load();
  }, []);

  if (!isMF && !isVerwalter) {
    return <ProtectedRoute allowedRoles={['trainings_verwalter', 'admin']}><div /></ProtectedRoute>;
  }

  if (!loaded) return <div className="text-center py-12 text-gray-500">Laden...</div>;

  const getStatus = (spieltagId: string, spielerId: string): string => verf[spieltagId]?.[spielerId] || '';

  // Spieltage filtern nach Mannschaft
  const filteredSt = filterM ? spieltage.filter((s: any) => s.mannschaft === filterM) : spieltage;

  // Spieler: bei Mannschafts-Filter nach Kernmannschaft filtern
  const filteredSpieler = spieler
    .filter((s: any) => s.setzlistePosition && s.setzlistePosition > 0)
    .filter((s: any) => {
      if (!filterM) return true;
      return s.kern === filterM;
    })
    .sort((a: any, b: any) => (a.setzlistePosition || 99) - (b.setzlistePosition || 99));

  return (
    <ProtectedRoute>
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Verfügbarkeits-Matrix</h2>
        </div>
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Mannschafts-Filter</p>
          <div className="flex gap-2">
            {[null, 1, 2, 3, 4].map(m => (
              <button key={m ?? 'alle'} type="button" onClick={() => setFilterM(m)}
                className={`px-5 py-2 rounded text-sm font-medium ${filterM === m ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {m === null ? 'Alle' : `${m}. Mannschaft`}
              </button>
            ))}
          </div>
        </div>

        {/* Zusammenfassung pro Spieltag */}
        <div className="space-y-2 mb-6">
          {filteredSt.map((st: any) => {
            const zusagen = filteredSpieler.filter((s: any) => getStatus(st.id, s.id) === 'ja');
            const unsichere = filteredSpieler.filter((s: any) => getStatus(st.id, s.id) === 'vielleicht');
            const absagen = filteredSpieler.filter((s: any) => getStatus(st.id, s.id) === 'nein');
            const zuWenig = zusagen.length < 6;
            const cardClass = zuWenig ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200';

            return (
              <div key={st.id} className={`rounded-lg border p-3 ${cardClass}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm">
                    {st.mannschaft}. Mannschaft · {formatKurz(st.datum)} {st.uhrzeit} · {st.heimspiel ? '🏠' : '🚗'} vs {st.gegner}
                  </span>
                  <span className={`text-sm font-bold ${zuWenig ? 'text-red-600' : 'text-green-600'}`}>{zusagen.length}/6</span>
                </div>
                <div className="text-xs text-gray-600 space-y-0.5">
                  {zusagen.length > 0 && <p>✅ <span className="text-green-700">{zusagen.map((s: any) => `${s.vorname} ${s.name}`).join(', ')}</span></p>}
                  {unsichere.length > 0 && <p>❓ <span className="text-yellow-700">{unsichere.map((s: any) => `${s.vorname} ${s.name}`).join(', ')}</span></p>}
                  {absagen.length > 0 && <p>❌ <span className="text-red-700">{absagen.map((s: any) => `${s.vorname} ${s.name}`).join(', ')}</span></p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Matrix-Tabelle */}
        <h3 className="font-bold text-gray-700 mb-2">Gesamtübersicht</h3>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1 text-left sticky left-0 bg-gray-100 z-10 min-w-[140px]">Spieler</th>
                <th className="border border-gray-300 px-1 py-1 text-left w-12">LK</th>
                <th className="border border-gray-300 px-1 py-1 text-center w-8">K</th>
                {filteredSt.map((st: any) => (
                  <th key={st.id} className="border border-gray-300 px-1 py-1 text-center min-w-[50px]">
                    <div>{formatKurz(st.datum)}</div>
                    <div className="text-[10px] text-gray-400">{st.heimspiel ? 'H' : 'A'}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSpieler.map((s: any) => {
                const stammM = getStammM(s.setzlistePosition);
                const isKern = filterM ? stammM === filterM : true;
                return (
                  <tr key={s.id} className={isKern ? '' : 'text-gray-400'}>
                    <td className="border border-gray-300 px-2 py-1 sticky left-0 bg-white z-10 whitespace-nowrap">
                      {s.vorname} {s.name}
                      {festspielMap[s.id]?.festgespielt && (
                        <span className="ml-1 text-red-600 text-[10px]">🔒M{festspielMap[s.id].festgespieltIn.join(',')}</span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{s.lk ? Number(s.lk).toFixed(1) : '-'}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{s.kern ? `M${s.kern}` : ''}</td>
                    {filteredSt.map((st: any) => {
                      const status = getStatus(st.id, s.id);
                      return (
                        <td key={st.id} className={`border border-gray-300 px-1 py-1 text-center ${STATUS_BG[status]}`}>
                          {STATUS_ICON[status]}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td className="border border-gray-300 px-2 py-1 sticky left-0 bg-gray-50 z-10" colSpan={3}>Zusagen</td>
                {filteredSt.map((st: any) => {
                  const count = filteredSpieler.filter((s: any) => getStatus(st.id, s.id) === 'ja').length;
                  return (
                    <td key={st.id} className={`border border-gray-300 px-1 py-1 text-center ${count < 6 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
                      {count}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ProtectedRoute>
  );
}
