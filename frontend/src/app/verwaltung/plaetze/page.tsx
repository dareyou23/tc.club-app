'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import Link from 'next/link';

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export default function VerwaltungPlaetzePage() {
  const { currentUser } = useAuth();
  const isMF = currentUser?.mannschaftsfuehrer === true;
  const isVerwalter = currentUser?.rolle === 'trainings_verwalter' || currentUser?.rolle === 'club_manager' || currentUser?.rolle === 'admin';
  const [plaetze, setPlaetze] = useState<any[]>([]);
  const [saisons, setSaisons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [pRes, sRes] = await Promise.all([
        apiClient.listPlaetze(),
        apiClient.listSaisons(),
      ]);
      if (pRes.success && pRes.data) setPlaetze(pRes.data);
      if (sRes.success && sRes.data) setSaisons(sRes.data);
      setLoading(false);
    }
    load();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Trainingszeit "${name}" und alle zukünftigen Slots wirklich löschen?`)) return;
    const res = await apiClient.deletePlatz(id);
    if (res.success) setPlaetze(prev => prev.filter(p => p.id !== id));
  };

  if (!isMF && !isVerwalter) {
    return <ProtectedRoute allowedRoles={['trainings_verwalter', 'admin']}><div /></ProtectedRoute>;
  }

  return (
    <ProtectedRoute>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Trainingszeiten verwalten</h1>
        <Link href="/verwaltung/plaetze/neu"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">
          + Neue Trainingszeit
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Laden...</p>
      ) : (
        <div className="space-y-6">
          {/* Plätze nach Saison gruppieren */}
          {(() => {
            const saisonMap = new Map(saisons.map((s: any) => [s.id, s]));
            const grouped = new Map<string, any[]>();
            for (const p of plaetze) {
              const key = p.saisonId || 'ohne';
              if (!grouped.has(key)) grouped.set(key, []);
              grouped.get(key)!.push(p);
            }
            // Sortierung: aktive Saison zuerst, dann geplante
            const sortedKeys = [...grouped.keys()].sort((a, b) => {
              const sa = saisonMap.get(a);
              const sb = saisonMap.get(b);
              const order = { aktiv: 0, geplant: 1, archiviert: 2 };
              return (order[sa?.status as keyof typeof order] ?? 3) - (order[sb?.status as keyof typeof order] ?? 3);
            });
            return sortedKeys.map(saisonId => {
              const saison = saisonMap.get(saisonId);
              const saisonPlaetze = grouped.get(saisonId) || [];
              return (
                <div key={saisonId}>
                  <h2 className="text-lg font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    {saison ? saison.name : 'Ohne Saison'}
                    {saison?.status === 'aktiv' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">laufend</span>}
                    {saison?.status === 'geplant' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">geplant</span>}
                  </h2>
                  <div className="space-y-3">
                    {saisonPlaetze.map(p => (
                      <div key={p.id} className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold">{p.name}</h3>
                          <p className="text-sm text-gray-600">
                            {WOCHENTAGE[p.wochentag]} {p.uhrzeit}{p.uhrzeitBis ? `–${p.uhrzeitBis}` : ''} · {p.ort}
                            {p.trainerName ? ` · Trainer: ${p.trainerName}` : ''}
                          </p>
                          <p className="text-xs text-gray-500">
                            Gruppe: {p.gruppengroesse} Spieler · {p.dauer}min
                            {p.nurHallentraining ? ' · 🏠 Nur Halle' : ''}
                            {p.platzTyp === 'saisonplanung' ? ' · 📋 Saisonplanung' : ''}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/verwaltung/plaetze/${p.id}`}
                            className="text-blue-600 hover:underline text-sm">Details</Link>
                          <button type="button" onClick={() => handleDelete(p.id, p.name)}
                            className="text-red-600 hover:underline text-sm">Löschen</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </ProtectedRoute>
  );
}
