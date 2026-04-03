'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

interface SlotWithVerf {
  id: string;
  datum: string;
  uhrzeit: string;
  platzId: string;
  status: string;
  verfuegbarCount: number;
  abgelehntCount: number;
  abgelehntSpieler: string[];
  meineVerfuegbarkeit: 'verfuegbar' | 'nicht_verfuegbar' | 'unbekannt';
  verfuegbareSpieler: string[];
  anzahlPlaetze: number;
}

export default function VerfuegbarkeitPage() {
  const { currentUser } = useAuth();
  const [plaetze, setPlaetze] = useState<any[]>([]);
  const [saisonPlaetze, setSaisonPlaetze] = useState<any[]>([]);
  const [slotsByPlatz, setSlotsByPlatz] = useState<Record<string, SlotWithVerf[]>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedAbgelehnt, setExpandedAbgelehnt] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser?.id) loadData();
  }, [currentUser?.id]);

  async function loadData() {
    setLoading(true);
    const res = await apiClient.listPlaetze();
    if (!res.success || !res.data) { setLoading(false); return; }

    const trainingPlaetze = res.data.filter((p: any) => p.platzTyp !== 'saisonplanung' && !p.trainerName);

    const isAdmin = currentUser?.rolle === 'admin' || currentUser?.rolle === 'trainings_verwalter';

    // Saisonplanungs-Plätze (mit Trainer oder platzTyp saisonplanung) separat sammeln
    const spPlaetze: any[] = [];
    for (const p of res.data.filter((p: any) => p.platzTyp === 'saisonplanung' || p.trainerName)) {
      const gruppeRes = await apiClient.getGruppe(p.id);
      const gruppe = gruppeRes.success && gruppeRes.data ? gruppeRes.data : [];
      if (gruppe.some((g: any) => g.spielerId === currentUser?.id) || isAdmin) {
        spPlaetze.push(p);
      }
    }
    setSaisonPlaetze(spPlaetze);

    // Nur Plätze anzeigen, in deren Buchungsgruppe der Spieler ist (Admin sieht alle)
    const meinePlaetze: any[] = [];
    for (const p of trainingPlaetze) {
      const gruppeRes = await apiClient.getGruppe(p.id);
      const gruppe = gruppeRes.success && gruppeRes.data ? gruppeRes.data : [];
      if (gruppe.some((g: any) => g.spielerId === currentUser?.id) || isAdmin) {
        meinePlaetze.push(p);
      }
    }
    setPlaetze(meinePlaetze);

    const today = new Date().toISOString().split('T')[0];
    const slotsMap: Record<string, SlotWithVerf[]> = {};

    for (const p of meinePlaetze) {
      const slotsRes = await apiClient.getPlatzSlots(p.id);
      if (!slotsRes.success || !slotsRes.data) continue;

      // Nur die nächsten 2 Slots pro Platz
      const futureSlots = slotsRes.data
        .filter((s: any) => s.datum >= today)
        .slice(0, 2);

      const enriched: SlotWithVerf[] = [];
      for (const slot of futureSlots) {
        const verfRes = await apiClient.getSlotVerfuegbarkeit(slot.id);
        const verfList = verfRes.success && verfRes.data ? verfRes.data : [];
        const verfuegbare = verfList.filter((v: any) => v.status === 'verfuegbar');
        const abgelehnte = verfList.filter((v: any) => v.status === 'nicht_verfuegbar');
        const meine = verfList.find((v: any) => v.spielerId === currentUser?.id);

        enriched.push({
          id: slot.id,
          datum: slot.datum,
          uhrzeit: slot.uhrzeit,
          platzId: slot.platzId,
          status: slot.status,
          verfuegbarCount: verfuegbare.length,
          abgelehntCount: abgelehnte.length,
          abgelehntSpieler: abgelehnte.map((v: any) => v.spielerName || v.spielerId),
          meineVerfuegbarkeit: meine?.status || 'unbekannt',
          verfuegbareSpieler: verfuegbare.map((v: any) => v.spielerName || v.spielerId),
          anzahlPlaetze: p.anzahlPlaetze || 1,
        });
      }
      slotsMap[p.id] = enriched;
    }

    setSlotsByPlatz(slotsMap);
    setLoading(false);
  }

  async function setVerfuegbarkeit(slotId: string, platzId: string, status: string) {
    setUpdating(slotId);
    const res = await apiClient.setVerfuegbarkeit(slotId, status);
    if (res.success) {
      const verfRes = await apiClient.getSlotVerfuegbarkeit(slotId);
      const verfList = verfRes.success && verfRes.data ? verfRes.data : [];
      const verfuegbare = verfList.filter((v: any) => v.status === 'verfuegbar');
      const abgelehnte = verfList.filter((v: any) => v.status === 'nicht_verfuegbar');
      const meine = verfList.find((v: any) => v.spielerId === currentUser?.id);

      setSlotsByPlatz(prev => ({
        ...prev,
        [platzId]: (prev[platzId] || []).map(s =>
          s.id === slotId ? {
            ...s,
            verfuegbarCount: verfuegbare.length,
            abgelehntCount: abgelehnte.length,
            abgelehntSpieler: abgelehnte.map((v: any) => v.spielerName || v.spielerId),
            meineVerfuegbarkeit: meine?.status || 'unbekannt',
            verfuegbareSpieler: verfuegbare.map((v: any) => v.spielerName || v.spielerId),
          } : s
        ),
      }));
    }
    setUpdating(null);
  }

  function getSlotColor(count: number): string {
    if (count < 4) return 'bg-red-50 border-red-400';
    if (count % 2 !== 0) return 'bg-orange-50 border-orange-400';
    return 'bg-green-50 border-green-400';
  }

  function formatDatum(datum: string): string {
    const d = new Date(datum + 'T12:00:00');
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  return (
    <ProtectedRoute>
      <h1 className="text-2xl font-bold mb-4">Meine Verfügbarkeit</h1>
      {loading ? (
        <p className="text-gray-500">Laden...</p>
      ) : plaetze.length === 0 && saisonPlaetze.length === 0 ? (
        <p className="text-gray-500">Keine Trainingsplätze in der aktuellen Saison.</p>
      ) : (
        <div className="space-y-6">
          {/* Saisonplanungs-Plätze als Hinweis */}
          {saisonPlaetze.map(p => (
            <div key={p.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-400">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-semibold text-lg mb-1">{p.name}</h2>
                  <p className="text-sm text-gray-500">
                    {WOCHENTAGE[p.wochentag]} {p.uhrzeit}{p.uhrzeitBis ? `–${p.uhrzeitBis}` : ''} · {p.ort}
                    {p.trainerName ? ` · Trainer: ${p.trainerName}` : ' · ohne Trainer'}
                  </p>
                </div>
                <Link href={`/verfuegbarkeit/saisonplanung?platzId=${p.id}`}
                  className="text-sm bg-purple-100 text-purple-700 px-3 py-2 rounded hover:bg-purple-200">
                  📋 Planung →
                </Link>
              </div>
              <p className="text-xs text-gray-400 mt-2">Verfügbarkeit und Zuordnung über die Saisonplanung</p>
            </div>
          ))}

          {plaetze.map(p => (
            <div key={p.id} className="bg-white rounded-lg shadow p-4">
              <h2 className="font-semibold text-lg mb-1">{p.name}</h2>
              <p className="text-sm text-gray-500 mb-3">
                {WOCHENTAGE[p.wochentag]} {p.uhrzeit}{p.uhrzeitBis ? `–${p.uhrzeitBis}` : ''} · {p.ort}
                {p.anzahlPlaetze > 1 ? ` · ${p.anzahlPlaetze} Plätze` : ''}
              </p>

              {!slotsByPlatz[p.id]?.length ? (
                <p className="text-gray-400 text-sm">Keine kommenden Termine.</p>
              ) : (
                <div className="space-y-3">
                  {slotsByPlatz[p.id].map(slot => (
                    <div key={slot.id}
                      className={`border-2 rounded-lg p-4 ${getSlotColor(slot.verfuegbarCount)}`}>
                      {/* Obere Zeile: Datum + Spieler-Info */}
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{formatDatum(slot.datum)}</p>
                          <p className="text-sm text-gray-600">{slot.uhrzeit} Uhr</p>
                        </div>
                        <div className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-xs px-2 py-1 rounded font-medium ${
                              slot.verfuegbarCount < 4 ? 'bg-red-100 text-red-700' :
                              slot.verfuegbarCount % 2 !== 0 ? 'bg-orange-100 text-orange-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {slot.verfuegbarCount} Spieler (min 4)
                              {slot.verfuegbarCount < 4 ? ' ⚠️' : slot.verfuegbarCount % 2 !== 0 ? ' ⚡' : ' ✅'}
                            </span>
                            {slot.abgelehntCount > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedAbgelehnt(expandedAbgelehnt === slot.id ? null : slot.id)}
                                className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                              >
                                {slot.abgelehntCount} abgelehnt
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Verfügbare Spieler */}
                      {slot.verfuegbareSpieler.length > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                          {slot.verfuegbareSpieler.join(', ')}
                        </p>
                      )}

                      {/* Abgelehnte Spieler aufklappbar */}
                      {expandedAbgelehnt === slot.id && slot.abgelehntSpieler.length > 0 && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                          <p className="font-medium mb-1">Können nicht:</p>
                          {slot.abgelehntSpieler.join(', ')}
                        </div>
                      )}

                      {/* Zwei Buttons: Kann + Kann nicht */}
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-500 mb-2">
                          {slot.meineVerfuegbarkeit === 'verfuegbar' ? '✅ Du kannst' :
                           slot.meineVerfuegbarkeit === 'nicht_verfuegbar' ? '❌ Kannst nicht' :
                           '❓ Noch offen'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={updating === slot.id}
                            onClick={() => setVerfuegbarkeit(slot.id, p.id, 'verfuegbar')}
                            className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                              slot.meineVerfuegbarkeit === 'verfuegbar'
                                ? 'bg-green-600 text-white'
                                : 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100'
                            } disabled:opacity-50`}
                          >
                            {updating === slot.id ? '...' : '✅ Kann'}
                          </button>
                          <button
                            type="button"
                            disabled={updating === slot.id}
                            onClick={() => setVerfuegbarkeit(slot.id, p.id, 'nicht_verfuegbar')}
                            className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                              slot.meineVerfuegbarkeit === 'nicht_verfuegbar'
                                ? 'bg-red-600 text-white'
                                : 'bg-red-50 text-red-700 border border-red-300 hover:bg-red-100'
                            } disabled:opacity-50`}
                          >
                            {updating === slot.id ? '...' : '❌ Kann nicht'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </ProtectedRoute>
  );
}
