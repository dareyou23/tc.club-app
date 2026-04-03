'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

interface UpcomingSlot {
  slotId: string;
  datum: string;
  uhrzeit: string;
  platzName: string;
  platzOrt: string;
  platzTyp: string;
  platzId: string;
  anzahlPlaetze: number;
  verfuegbarCount: number;
  abgelehntCount: number;
  abgelehntSpieler: string[];
  verfuegbareSpieler: string[];
  meineVerfuegbarkeit: string;
}

export default function KalenderPage() {
  const { currentUser } = useAuth();
  const [plaetze, setPlaetze] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingSlot[]>([]);
  const [allSlotsByPlatz, setAllSlotsByPlatz] = useState<Record<string, UpcomingSlot[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedAbgelehnt, setExpandedAbgelehnt] = useState<string | null>(null);
  const [medenSpieltage, setMedenSpieltage] = useState<any[]>([]);
  const [medenVerf, setMedenVerf] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (currentUser?.id) loadData();
  }, [currentUser?.id]);

  async function loadData() {
    // Meden-Spieltage laden
    const [stRes, vRes] = await Promise.all([
      apiClient.listMedenSpieltage(),
      apiClient.getAllMedenVerfuegbarkeit(),
    ]);
    if (stRes.success && stRes.data) setMedenSpieltage(stRes.data);
    if (vRes.success && vRes.data) setMedenVerf(vRes.data as any);

    const res = await apiClient.listPlaetze();
    if (!res.success || !res.data) { setLoading(false); return; }

    const today = new Date().toISOString().split('T')[0];
    const allSlots: UpcomingSlot[] = [];
    const meinePlaetze: any[] = [];

    const isAdmin = currentUser?.rolle === 'admin' || currentUser?.rolle === 'trainings_verwalter';

    for (const p of res.data) {
      const gruppeRes = await apiClient.getGruppe(p.id);
      const gruppe = gruppeRes.success && gruppeRes.data ? gruppeRes.data : [];
      const istMitglied = gruppe.some((g: any) => g.spielerId === currentUser?.id);
      if (!istMitglied && !isAdmin) continue;
      meinePlaetze.push(p);

      const hatTrainer = !!p.trainerName;
      const slotsRes = await apiClient.getPlatzSlots(p.id);
      if (!slotsRes.success || !slotsRes.data) continue;

      const futureSlots = slotsRes.data
        .filter((s: any) => s.datum >= today)
        .slice(0, 2);

      for (const slot of futureSlots) {
        const verfRes = await apiClient.getSlotVerfuegbarkeit(slot.id);
        const verfList = verfRes.success && verfRes.data ? verfRes.data : [];
        const verfuegbare = verfList.filter((v: any) => v.status === 'verfuegbar');
        const abgelehnte = verfList.filter((v: any) => v.status === 'nicht_verfuegbar');
        const meine = verfList.find((v: any) => v.spielerId === currentUser?.id);

        allSlots.push({
          slotId: slot.id,
          datum: slot.datum,
          uhrzeit: slot.uhrzeit,
          platzName: p.name,
          platzOrt: p.ort,
          platzTyp: hatTrainer ? 'saisonplanung' : (p.platzTyp || 'training'),
          platzId: p.id,
          anzahlPlaetze: p.anzahlPlaetze || 1,
          verfuegbarCount: verfuegbare.length,
          abgelehntCount: abgelehnte.length,
          abgelehntSpieler: abgelehnte.map((a: any) => a.spielerName),
          verfuegbareSpieler: verfuegbare.map((v: any) => v.spielerName),
          meineVerfuegbarkeit: meine?.status || 'unbekannt',
        });
      }
    }

    allSlots.sort((a, b) => a.datum.localeCompare(b.datum) || a.uhrzeit.localeCompare(b.uhrzeit));
    setPlaetze(meinePlaetze);
    setUpcoming(allSlots.slice(0, 2));
    // Slots nach Platz gruppieren für "Meine Hallenplätze"
    const byPlatz: Record<string, UpcomingSlot[]> = {};
    for (const s of allSlots) {
      (byPlatz[s.platzId] = byPlatz[s.platzId] || []).push(s);
    }
    setAllSlotsByPlatz(byPlatz);
    setLoading(false);
  }

  async function handleVerfuegbarkeit(slotId: string, status: string) {
    setSaving(slotId);
    const res = await apiClient.setVerfuegbarkeit(slotId, status);
    setSaving(null);
    if (res.success) loadData();
  }

  function getSlotColor(slot: UpcomingSlot): string {
    if (slot.platzTyp === 'saisonplanung') return 'border-purple-400 bg-purple-50';
    if (slot.verfuegbarCount < 4) return 'border-red-400 bg-red-50';
    if (slot.verfuegbarCount % 2 !== 0) return 'border-orange-400 bg-orange-50';
    return 'border-green-400 bg-green-50';
  }

  function formatDatum(datum: string): string {
    const d = new Date(datum + 'T12:00:00');
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const byDate = upcoming.reduce<Record<string, UpcomingSlot[]>>((acc, s) => {
    (acc[s.datum] = acc[s.datum] || []).push(s);
    return acc;
  }, {});

  return (
    <ProtectedRoute>
      <div>
        <h1 className="text-2xl font-bold mb-1">Hallo {currentUser?.vorname} 👋</h1>
        <p className="text-gray-500 text-sm mb-6">Deine nächsten Termine</p>

        {/* Meden-Spieltage */}
        {(() => {
          const kern = currentUser?.kern;
          const myId = currentUser?.id;
          const kernSt = kern ? medenSpieltage.filter((s: any) => s.mannschaft === kern) : [];
          const andereSt = medenSpieltage.filter((s: any) => {
            if (kern && s.mannschaft === kern) return false;
            if (!myId) return false;
            const status = medenVerf[s.id]?.[myId];
            return status === 'ja' || status === 'vielleicht';
          });
          const alleMeden = [...kernSt, ...andereSt];
          if (alleMeden.length === 0) return null;
          return (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-600 mb-2">🎾 Meden-Spieltage</h2>
              <div className="space-y-2">
                {alleMeden.map((st: any) => {
                  const myStatus = myId ? (medenVerf[st.id]?.[myId] || '') : '';
                  return (
                    <Link key={st.id} href="/meden/spieltage"
                      className={`block bg-white rounded-lg shadow p-3 border-l-4 ${
                        st.mannschaft === kern ? 'border-blue-500' : 'border-gray-300'
                      }`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-sm">{st.mannschaft}. Mannschaft · {formatDatum(st.datum)} {st.uhrzeit}</p>
                          <p className="text-xs text-gray-600">{st.heimspiel ? '🏠 Heim' : '🚗 Auswärts'} vs {st.gegner}</p>
                        </div>
                        <span className="text-xs">{myStatus === 'ja' ? '✅' : myStatus === 'vielleicht' ? '❓' : myStatus === 'nein' ? '❌' : '—'}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {loading ? (
          <p className="text-gray-500">Laden...</p>
        ) : upcoming.length === 0 ? (
          <p className="text-gray-500">Keine kommenden Termine.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(byDate).map(([datum, slots]) => (
              <div key={datum}>
                <h2 className="text-sm font-semibold text-gray-600 mb-2">{formatDatum(datum)}</h2>
                <div className="space-y-2">
                  {slots.map(slot => (
                    <div key={slot.slotId}
                      className={`bg-white rounded-lg shadow p-4 border-l-4 ${getSlotColor(slot)}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold">{slot.platzName}</h3>
                          <p className="text-sm text-gray-600">{slot.uhrzeit} Uhr · {slot.platzOrt}</p>
                        </div>
                        <div className="text-right">
                          {slot.platzTyp === 'saisonplanung' ? (
                            <Link href={`/verfuegbarkeit/saisonplanung?platzId=${slot.platzId}`}
                              className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200">
                              📋 Planung →
                            </Link>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-xs px-2 py-1 rounded ${
                                slot.verfuegbarCount < 4 ? 'bg-red-100 text-red-700' :
                                slot.verfuegbarCount % 2 !== 0 ? 'bg-orange-100 text-orange-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {slot.verfuegbarCount} Spieler (min 4)
                                {slot.verfuegbarCount < 4 ? ' ⚠️' : slot.verfuegbarCount % 2 !== 0 ? ' ⚡' : ' ✅'}
                              </span>
                              {slot.abgelehntCount > 0 && (
                                <button type="button"
                                  onClick={() => setExpandedAbgelehnt(expandedAbgelehnt === slot.slotId ? null : slot.slotId)}
                                  className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                                  {slot.abgelehntCount} abgelehnt
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Mitspieler anzeigen */}
                      {slot.verfuegbareSpieler.length > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                          🎾 {slot.verfuegbareSpieler.join(', ')}
                        </p>
                      )}

                      {/* Abgelehnte aufklappbar */}
                      {expandedAbgelehnt === slot.slotId && slot.abgelehntSpieler.length > 0 && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                          <p className="font-medium mb-1">Können nicht:</p>
                          {slot.abgelehntSpieler.join(', ')}
                        </div>
                      )}

                      {/* Buttons */}
                      {slot.platzTyp !== 'saisonplanung' && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs text-gray-500 mb-2">
                            {slot.meineVerfuegbarkeit === 'verfuegbar' ? '✅ Du kannst' :
                             slot.meineVerfuegbarkeit === 'nicht_verfuegbar' ? '❌ Kannst nicht' :
                             '❓ Noch offen'}
                          </p>
                          <div className="flex gap-2">
                            <button type="button" disabled={saving === slot.slotId}
                              onClick={() => handleVerfuegbarkeit(slot.slotId, 'verfuegbar')}
                              className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                                slot.meineVerfuegbarkeit === 'verfuegbar'
                                  ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100'
                              } disabled:opacity-50`}>
                              {saving === slot.slotId ? '...' : '✅ Kann'}
                            </button>
                            <button type="button" disabled={saving === slot.slotId}
                              onClick={() => handleVerfuegbarkeit(slot.slotId, 'nicht_verfuegbar')}
                              className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                                slot.meineVerfuegbarkeit === 'nicht_verfuegbar'
                                  ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-300 hover:bg-red-100'
                              } disabled:opacity-50`}>
                              {saving === slot.slotId ? '...' : '❌ Kann nicht'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Platz-Übersicht */}
        <h2 className="text-lg font-semibold mt-8 mb-3">Meine Hallenplätze</h2>
        {plaetze.length === 0 ? (
          <p className="text-gray-500">Keine Hallenplätze in der aktuellen Saison.</p>
        ) : (
          <div className="space-y-3">
            {plaetze.map(p => (
              <div key={p.id} className={`bg-white rounded-lg shadow p-4 border-l-4 ${
                (p.platzTyp === 'saisonplanung' || p.trainerName) ? 'border-purple-500' : 'border-blue-500'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="text-sm text-gray-600">
                      {WOCHENTAGE[p.wochentag]} {p.uhrzeit}{p.uhrzeitBis ? `–${p.uhrzeitBis}` : ''} · {p.ort}
                    </p>
                  </div>
                  {(p.platzTyp === 'saisonplanung' || p.trainerName) && (
                    <Link href={`/verfuegbarkeit/saisonplanung?platzId=${p.id}`}
                      className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200">
                      📋 Planung →
                    </Link>
                  )}
                </div>
                {p.platzTyp !== 'saisonplanung' && !p.trainerName && (
                  <>
                    <div className="mt-2 flex gap-2 text-xs">
                      <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        Gruppe: {p.gruppengroesse}
                      </span>
                      {p.anzahlPlaetze > 1 && (
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                          {p.anzahlPlaetze} Plätze
                        </span>
                      )}
                    </div>
                    {/* Nächste Slots mit Kann/Kann-nicht */}
                    {(allSlotsByPlatz[p.id] || []).map(slot => (
                      <div key={slot.slotId} className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">{formatDatum(slot.datum)} · {slot.uhrzeit} Uhr</span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            slot.verfuegbarCount < 4 ? 'bg-red-100 text-red-700' :
                            slot.verfuegbarCount % 2 !== 0 ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {slot.verfuegbarCount} Spieler (min 4)
                          </span>
                        </div>
                        {slot.verfuegbareSpieler.length > 0 && (
                          <p className="text-xs text-gray-500 mb-2">🎾 {slot.verfuegbareSpieler.join(', ')}</p>
                        )}
                        <p className="text-xs text-gray-500 mb-2">
                          {slot.meineVerfuegbarkeit === 'verfuegbar' ? '✅ Du kannst' :
                           slot.meineVerfuegbarkeit === 'nicht_verfuegbar' ? '❌ Kannst nicht' :
                           '❓ Noch offen'}
                        </p>
                        <div className="flex gap-2">
                          <button type="button" disabled={saving === slot.slotId}
                            onClick={() => handleVerfuegbarkeit(slot.slotId, 'verfuegbar')}
                            className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                              slot.meineVerfuegbarkeit === 'verfuegbar'
                                ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100'
                            } disabled:opacity-50`}>
                            {saving === slot.slotId ? '...' : '✅ Kann'}
                          </button>
                          <button type="button" disabled={saving === slot.slotId}
                            onClick={() => handleVerfuegbarkeit(slot.slotId, 'nicht_verfuegbar')}
                            className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                              slot.meineVerfuegbarkeit === 'nicht_verfuegbar'
                                ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-300 hover:bg-red-100'
                            } disabled:opacity-50`}>
                            {saving === slot.slotId ? '...' : '❌ Kann nicht'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {p.trainerName && (
                  <div className="mt-2 flex gap-2 text-xs">
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
                      Trainer: {p.trainerName}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
