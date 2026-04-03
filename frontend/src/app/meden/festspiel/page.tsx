'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

interface FestspielInfo {
  spielerId: string;
  name: string;
  stammMannschaft: number;
  rang?: number;
  mannschaften: { mannschaft: number; count: number; einsaetze: { datum: string; spieltagId: string }[] }[];
  festgespielt: boolean;
  festgespieltIn: number[];
}

function getStammM(rang?: number): number {
  if (!rang || rang < 1) return 4;
  if (rang <= 6) return 1;
  if (rang <= 12) return 2;
  if (rang <= 18) return 3;
  return 4;
}

export default function FestspielPage() {
  const { currentUser } = useAuth();
  const [data, setData] = useState<FestspielInfo[]>([]);
  const [spieler, setSpieler] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const isMF = currentUser?.mannschaftsfuehrer === true;
  const isVerwalter = currentUser?.rolle === 'trainings_verwalter' || currentUser?.rolle === 'admin';

  useEffect(() => {
    async function load() {
      const [fsRes, spRes] = await Promise.all([
        apiClient.getFestspielStatus(),
        apiClient.listSpieler(),
      ]);
      if (fsRes.success && fsRes.data) setData(fsRes.data);
      if (spRes.success && spRes.data) setSpieler(spRes.data);
      setLoaded(true);
    }
    load();
  }, []);

  if (!isMF && !isVerwalter) {
    return <ProtectedRoute allowedRoles={['trainings_verwalter', 'admin']}><div /></ProtectedRoute>;
  }

  if (!loaded) return <div className="text-center py-12 text-gray-500">Laden...</div>;

  // Alle Spieler mit Rang, auch die ohne Einsätze
  const alleSpieler = spieler
    .filter((s: any) => s.setzlistePosition && s.setzlistePosition > 0)
    .sort((a: any, b: any) => (a.setzlistePosition || 99) - (b.setzlistePosition || 99));

  // Einsatz-Daten pro Spieler mergen
  const einsatzMap = new Map<string, FestspielInfo>();
  for (const d of data) einsatzMap.set(d.spielerId, d);

  return (
    <ProtectedRoute>
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-4">Festspiel-Übersicht</h2>
        <p className="text-sm text-gray-600 mb-4">
          Ab 3 Einsätzen in einer höheren Mannschaft ist ein Spieler dort festgespielt
          und darf nicht mehr in niedrigeren Mannschaften spielen.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className="border border-gray-300 px-3 py-2 text-left">Ra.</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Spieler</th>
                <th className="border border-gray-300 px-3 py-2 text-center">Stamm</th>
                <th className="border border-gray-300 px-3 py-2 text-center">M1</th>
                <th className="border border-gray-300 px-3 py-2 text-center">M2</th>
                <th className="border border-gray-300 px-3 py-2 text-center">M3</th>
                <th className="border border-gray-300 px-3 py-2 text-center">M4</th>
                <th className="border border-gray-300 px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {alleSpieler.map((s: any) => {
                const stammM = getStammM(s.setzlistePosition);
                const info = einsatzMap.get(s.id);
                const getCount = (m: number) => info?.mannschaften.find(x => x.mannschaft === m)?.count || 0;

                const cellClass = (m: number) => {
                  if (m === stammM) return 'bg-blue-50 font-medium'; // Stammmannschaft
                  if (m > stammM) return ''; // niedrigere Mannschaft — kein Aushelfen
                  const count = getCount(m);
                  if (count >= 3) return 'bg-red-200 font-bold text-red-800'; // festgespielt
                  if (count === 2) return 'bg-yellow-200 text-yellow-800'; // Warnung
                  if (count > 0) return 'bg-green-50';
                  return '';
                };

                return (
                  <tr key={s.id} className="border-t">
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-500">{s.setzlistePosition}</td>
                    <td className="border border-gray-300 px-3 py-1.5 font-medium">{s.vorname} {s.name}</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-center text-xs">M{stammM}</td>
                    {[1, 2, 3, 4].map(m => (
                      <td key={m} className={`border border-gray-300 px-3 py-1.5 text-center ${cellClass(m)}`}>
                        {m === stammM ? '●' : getCount(m) || ''}
                      </td>
                    ))}
                    <td className="border border-gray-300 px-3 py-1.5 text-center">
                      {info?.festgespielt ? (
                        <span className="text-red-700 font-bold text-xs">🔒 M{info.festgespieltIn.join(',')}</span>
                      ) : info && info.mannschaften.some(m => m.mannschaft < stammM && m.count === 2) ? (
                        <span className="text-yellow-700 text-xs">⚠️ Warnung</span>
                      ) : (
                        <span className="text-green-600 text-xs">✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-gray-500 space-y-1">
          <p>● = Stammmannschaft (basierend auf Rang)</p>
          <p className="text-yellow-700">Gelb = 2 Einsätze (nächster = festgespielt)</p>
          <p className="text-red-700">Rot = 3+ Einsätze (festgespielt)</p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
