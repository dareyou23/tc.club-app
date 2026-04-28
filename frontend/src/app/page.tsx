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

      const futureSlots = slotsRes.data.filter((s: any) => s.datum >= today).slice(0, 2);
      for (const slot of futureSlots) {
        const verfRes = await apiClient.getSlotVerfuegbarkeit(slot.id);
        const verfList = verfRes.success && verfRes.data ? verfRes.data : [];
        const verfuegbare = verfList.filter((v: any) => v.status === 'verfuegbar');
        const abgelehnte = verfList.filter((v: any) => v.status === 'nicht_verfuegbar');
        const meine = verfList.find((v: any) => v.spielerId === currentUser?.id);

        allSlots.push({
          slotId: slot.id, datum: slot.datum, uhrzeit: slot.uhrzeit,
          platzName: p.name, platzOrt: p.ort,
          platzTyp: hatTrainer ? 'saisonplanung' : (p.platzTyp || 'training'),
          platzId: p.id, anzahlPlaetze: p.anzahlPlaetze || 1,
          verfuegbarCount: verfuegbare.length, abgelehntCount: abgelehnte.length,
          abgelehntSpieler: abgelehnte.map((a: any) => a.spielerName),
          verfuegbareSpieler: verfuegbare.map((v: any) => v.spielerName),
          meineVerfuegbarkeit: meine?.status || 'unbekannt',
        });
      }
    }

    allSlots.sort((a, b) => a.datum.localeCompare(b.datum) || a.uhrzeit.localeCompare(b.uhrzeit));
    setPlaetze(meinePlaetze);
    setUpcoming(allSlots.slice(0, 2));
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

  function statusColor(count: number) {
    if (count < 4) return { bg: 'bg-red-50', border: 'border-red-300', badge: 'bg-red-100 text-red-700' };
    if (count % 2 !== 0) return { bg: 'bg-amber-50', border: 'border-amber-300', badge: 'bg-amber-100 text-amber-700' };
    return { bg: 'bg-emerald-50', border: 'border-emerald-300', badge: 'bg-emerald-100 text-emerald-700' };
  }

  function formatDatum(datum: string): string {
    const d = new Date(datum + 'T12:00:00');
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatDatumShort(datum: string): string {
    const d = new Date(datum + 'T12:00:00');
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  const byDate = upcoming.reduce<Record<string, UpcomingSlot[]>>((acc, s) => {
    (acc[s.datum] = acc[s.datum] || []).push(s);
    return acc;
  }, {});

  return (
    <ProtectedRoute>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hallo {currentUser?.vorname} 👋</h1>
          <p className="text-gray-500 mt-1">Deine nächsten Termine</p>
        </div>

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
            <section>
              <p className="section-title mb-3">🎾 Meden-Spieltage</p>
              <div className="space-y-2">
                {alleMeden.map((st: any) => {
                  const myStatus = myId ? (medenVerf[st.id]?.[myId] || '') : '';
                  return (
                    <Link key={st.id} href="/meden/spieltage"
                      className={`card-accent block p-4 ${st.mannschaft === kern ? 'border-blue-500' : 'border-gray-200'}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-gray-900">M{st.mannschaft} · {formatDatumShort(st.datum)} · {st.uhrzeit}</p>
                          <p className="text-sm text-gray-500 mt-0.5">{st.heimspiel ? '🏠 Heim' : '🚗 Auswärts'} vs {st.gegner}</p>
                        </div>
                        <span className={`badge ${myStatus === 'ja' ? 'bg-emerald-100 text-emerald-700' : myStatus === 'vielleicht' ? 'bg-amber-100 text-amber-700' : myStatus === 'nein' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                          {myStatus === 'ja' ? '✅ Dabei' : myStatus === 'vielleicht' ? '❓ Unsicher' : myStatus === 'nein' ? '❌ Nein' : '—'}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {/* Nächste Termine */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : upcoming.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">Keine kommenden Termine</p>
          </div>
        ) : (
          <section className="space-y-6">
            {Object.entries(byDate).map(([datum, slots]) => (
              <div key={datum}>
                <p className="section-title mb-3">{formatDatum(datum)}</p>
                <div className="space-y-3">
                  {slots.map(slot => {
                    const colors = statusColor(slot.verfuegbarCount);
                    return (
                      <div key={slot.slotId} className={`card-accent p-5 ${colors.border}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-gray-900">{slot.platzName}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">{slot.uhrzeit} Uhr · {slot.platzOrt}</p>
                          </div>
                          {slot.platzTyp === 'saisonplanung' ? (
                            <Link href={`/verfuegbarkeit/saisonplanung?platzId=${slot.platzId}`}
                              className="badge bg-purple-100 text-purple-700 hover:bg-purple-200">
                              📋 Planung →
                            </Link>
                          ) : (
                            <div className="flex flex-col items-end gap-1.5">
                              <span className={`badge ${colors.badge}`}>
                                {slot.verfuegbarCount} Spieler
                                {slot.verfuegbarCount < 4 ? ' ⚠️' : slot.verfuegbarCount % 2 !== 0 ? ' ⚡' : ' ✅'}
                              </span>
                              {slot.abgelehntCount > 0 && (
                                <button type="button"
                                  onClick={() => setExpandedAbgelehnt(expandedAbgelehnt === slot.slotId ? null : slot.slotId)}
                                  className="badge bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer">
                                  {slot.abgelehntCount} abgelehnt
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {slot.verfuegbareSpieler.length > 0 && (
                          <p className="text-xs text-gray-400 mt-3">
                            🎾 {slot.verfuegbareSpieler.join(', ')}
                          </p>
                        )}

                        {expandedAbgelehnt === slot.slotId && slot.abgelehntSpieler.length > 0 && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                            <p className="font-medium mb-1">Können nicht:</p>
                            {slot.abgelehntSpieler.join(', ')}
                          </div>
                        )}

                        {slot.platzTyp !== 'saisonplanung' && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <p className="text-xs text-gray-400 mb-3">
                              {slot.meineVerfuegbarkeit === 'verfuegbar' ? '✅ Du kannst' :
                               slot.meineVerfuegbarkeit === 'nicht_verfuegbar' ? '❌ Kannst nicht' :
                               '❓ Noch offen'}
                            </p>
                            <div className="flex gap-2">
                              <button type="button" disabled={saving === slot.slotId}
                                onClick={() => handleVerfuegbarkeit(slot.slotId, 'verfuegbar')}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
                                  slot.meineVerfuegbarkeit === 'verfuegbar'
                                    ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                } disabled:opacity-50`}>
                                {saving === slot.slotId ? '...' : '✅ Kann'}
                              </button>
                              <button type="button" disabled={saving === slot.slotId}
                                onClick={() => handleVerfuegbarkeit(slot.slotId, 'nicht_verfuegbar')}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
                                  slot.meineVerfuegbarkeit === 'nicht_verfuegbar'
                                    ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                                } disabled:opacity-50`}>
                                {saving === slot.slotId ? '...' : '❌ Kann nicht'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Meine Hallenplätze */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Meine Hallenplätze</h2>
          {plaetze.length === 0 ? (
            <p className="text-gray-400">Keine Hallenplätze in der aktuellen Saison.</p>
          ) : (
            <div className="space-y-4">
              {plaetze.map(p => (
                <div key={p.id} className={`card-accent p-5 ${
                  (p.platzTyp === 'saisonplanung' || p.trainerName) ? 'border-purple-400' : 'border-blue-400'
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{p.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {WOCHENTAGE[p.wochentag]} {p.uhrzeit}{p.uhrzeitBis ? `–${p.uhrzeitBis}` : ''} · {p.ort}
                      </p>
                    </div>
                    {(p.platzTyp === 'saisonplanung' || p.trainerName) && (
                      <Link href={`/verfuegbarkeit/saisonplanung?platzId=${p.id}`}
                        className="badge bg-purple-100 text-purple-700 hover:bg-purple-200">
                        📋 Planung →
                      </Link>
                    )}
                  </div>

                  {p.trainerName && (
                    <div className="mt-3">
                      <span className="badge bg-emerald-100 text-emerald-700">🎓 {p.trainerName}</span>
                    </div>
                  )}

                  {p.platzTyp !== 'saisonplanung' && !p.trainerName && (
                    <>
                      <div className="mt-3 flex gap-2">
                        <span className="badge bg-blue-50 text-blue-600">👥 {p.gruppengroesse} Spieler</span>
                        {p.anzahlPlaetze > 1 && (
                          <span className="badge bg-indigo-50 text-indigo-600">{p.anzahlPlaetze} Plätze</span>
                        )}
                      </div>

                      {(allSlotsByPlatz[p.id] || []).map(slot => {
                        const colors = statusColor(slot.verfuegbarCount);
                        return (
                          <div key={slot.slotId} className="mt-4 pt-4 border-t border-gray-100">
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-sm font-medium text-gray-700">{formatDatumShort(slot.datum)} · {slot.uhrzeit}</span>
                              <span className={`badge ${colors.badge}`}>{slot.verfuegbarCount} Spieler</span>
                            </div>
                            {slot.verfuegbareSpieler.length > 0 && (
                              <p className="text-xs text-gray-400 mb-3">🎾 {slot.verfuegbareSpieler.join(', ')}</p>
                            )}
                            <p className="text-xs text-gray-400 mb-3">
                              {slot.meineVerfuegbarkeit === 'verfuegbar' ? '✅ Du kannst' :
                               slot.meineVerfuegbarkeit === 'nicht_verfuegbar' ? '❌ Kannst nicht' :
                               '❓ Noch offen'}
                            </p>
                            <div className="flex gap-2">
                              <button type="button" disabled={saving === slot.slotId}
                                onClick={() => handleVerfuegbarkeit(slot.slotId, 'verfuegbar')}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
                                  slot.meineVerfuegbarkeit === 'verfuegbar'
                                    ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                } disabled:opacity-50`}>
                                {saving === slot.slotId ? '...' : '✅ Kann'}
                              </button>
                              <button type="button" disabled={saving === slot.slotId}
                                onClick={() => handleVerfuegbarkeit(slot.slotId, 'nicht_verfuegbar')}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
                                  slot.meineVerfuegbarkeit === 'nicht_verfuegbar'
                                    ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                                } disabled:opacity-50`}>
                                {saving === slot.slotId ? '...' : '❌ Kann nicht'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ProtectedRoute>
  );
}
