'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

interface SlotData { id: string; datum: string; }
interface SpielerData { id: string; name: string; }
interface PlatzOption { id: string; name: string; uhrzeit: string; uhrzeitBis?: string; trainerName?: string; wochentag?: number; saisonId: string; platzTyp: string; saisonName?: string; saisonTyp?: string; saisonStatus?: string; saisonStart?: string; gesperrt?: boolean; freigabeDatum?: string; }
type SetMap = Record<string, Set<string>>;
type CountMap = Record<string, number>;

export default function SaisonplanungPageWrapper() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-500">Laden...</div>}>
      <SaisonplanungPage />
    </Suspense>
  );
}

function SaisonplanungPage() {
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const queryPlatzId = searchParams.get('platzId');
  const [allePlaetze, setAllePlaetze] = useState<PlatzOption[]>([]);
  const [selectedPlatzId, setSelectedPlatzId] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [spieler, setSpieler] = useState<SpielerData[]>([]);
  const [verfuegbarkeit, setVerfuegbarkeit] = useState<SetMap>({});
  const [nichtVerfuegbar, setNichtVerfuegbar] = useState<SetMap>({});
  const [zuweisungen, setZuweisungen] = useState<SetMap>({});
  const [zuwCounts, setZuwCounts] = useState<CountMap>({});
  const [loading, setLoading] = useState(true);
  const [loadingPlatz, setLoadingPlatz] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lade alle Plätze und Saisons einmalig
  useEffect(() => {
    if (currentUser?.id) loadPlaetze();
  }, [currentUser?.id]);

  async function loadPlaetze() {
    setLoading(true);
    const [plaetzeRes, saisonsRes] = await Promise.all([
      apiClient.listPlaetze(),
      apiClient.listSaisons(),
    ]);
    if (!plaetzeRes.success || !plaetzeRes.data) { setLoading(false); return; }

    const saisons = saisonsRes.success && saisonsRes.data ? saisonsRes.data : [];
    const saisonMap = new Map(saisons.map((s: any) => [s.id, s]));
    const now = new Date();

    // Alle Plätze mit Saison-Info anreichern
    const plaetze: PlatzOption[] = plaetzeRes.data.map((p: any) => {
      const saison = saisonMap.get(p.saisonId) as any;
      let gesperrt = false;
      let freigabeDatum: string | undefined;

      if (saison && saison.status === 'geplant') {
        const startDate = new Date(saison.startDatum);
        const diffWeeks = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 7);
        if (diffWeeks > 6) {
          gesperrt = true;
          const fd = new Date(startDate);
          fd.setDate(fd.getDate() - 42);
          freigabeDatum = fd.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
      }

      return {
        id: p.id, name: p.name, uhrzeit: p.uhrzeit, uhrzeitBis: p.uhrzeitBis,
        trainerName: p.trainerName, wochentag: p.wochentag, saisonId: p.saisonId,
        platzTyp: p.platzTyp,
        saisonName: saison?.name, saisonTyp: saison?.typ, saisonStatus: saison?.status,
        saisonStart: saison?.startDatum,
        gesperrt, freigabeDatum,
      };
    });

    setAllePlaetze(plaetze);

    // Für nicht-Admin/Verwalter: nur Plätze zeigen wo User Mitglied ist
    const isAdmin = currentUser?.rolle === 'admin' || currentUser?.rolle === 'trainings_verwalter' || currentUser?.rolle === 'club_manager';
    let meinePlaetze = plaetze;
    if (!isAdmin) {
      const mitgliedschaft: string[] = [];
      for (const p of plaetze) {
        const gRes = await apiClient.getGruppe(p.id);
        if (gRes.success && gRes.data && gRes.data.some((g: any) => g.spielerId === currentUser?.id)) {
          mitgliedschaft.push(p.id);
        }
      }
      meinePlaetze = plaetze.filter(p => mitgliedschaft.includes(p.id));
      setAllePlaetze(meinePlaetze);
    }

    // Platz auswählen: queryParam > nächste nicht-gesperrte Saison > erster Platz
    let selected: PlatzOption | undefined;
    if (queryPlatzId) {
      selected = meinePlaetze.find(p => p.id === queryPlatzId);
    }
    if (!selected) {
      const nichtGesperrt = meinePlaetze.filter(p => !p.gesperrt);
      const geplant = nichtGesperrt.filter(p => p.saisonStatus === 'geplant');
      selected = geplant[0] || nichtGesperrt[0] || meinePlaetze[0];
    }

    if (selected) {
      setSelectedPlatzId(selected.id);
    }
    setLoading(false);
  }

  // Lade Daten für den ausgewählten Platz
  const loadPlatzData = useCallback(async (platzId: string) => {
    setLoadingPlatz(true);
    const gruppeRes = await apiClient.getGruppe(platzId);
    const gruppe = gruppeRes.success && gruppeRes.data ? gruppeRes.data : [];
    const spielerList: SpielerData[] = gruppe
      .map((g: any) => ({ id: g.spielerId, name: g.spielerName }))
      .sort((a: SpielerData, b: SpielerData) => a.name.localeCompare(b.name, 'de'));
    setSpieler(spielerList);

    const today = new Date().toISOString().split('T')[0];
    const slotsRes = await apiClient.getPlatzSlots(platzId);
    if (!slotsRes.success || !slotsRes.data) { setLoadingPlatz(false); return; }
    const futureSlots: SlotData[] = slotsRes.data
      .filter((s: any) => s.datum >= today)
      .map((s: any) => ({ id: s.id, datum: s.datum }));
    setSlots(futureSlots);

    const vMap: SetMap = {};
    const nvMap: SetMap = {};
    const zMap: SetMap = {};
    const counts: CountMap = {};
    for (const sp of spielerList) counts[sp.id] = 0;

    for (const slot of futureSlots) {
      const verfRes = await apiClient.getSlotVerfuegbarkeit(slot.id);
      const verfList = verfRes.success && verfRes.data ? verfRes.data : [];
      vMap[slot.id] = new Set(verfList.filter((v: any) => v.status === 'verfuegbar').map((v: any) => v.spielerId));
      nvMap[slot.id] = new Set(verfList.filter((v: any) => v.status === 'nicht_verfuegbar').map((v: any) => v.spielerId));

      const zuwRes = await apiClient.getSlotZuweisungen(slot.id);
      const zuwList = zuwRes.success && zuwRes.data ? zuwRes.data : [];
      zMap[slot.id] = new Set(zuwList.map((z: any) => z.spielerId));
      for (const z of zuwList) {
        if (counts[z.spielerId] !== undefined) counts[z.spielerId]++;
      }
    }

    setVerfuegbarkeit(vMap);
    setNichtVerfuegbar(nvMap);
    setZuweisungen(zMap);
    setZuwCounts(counts);
    setLoadingPlatz(false);
  }, []);

  // Wenn selectedPlatzId sich ändert, Daten laden
  useEffect(() => {
    if (selectedPlatzId && !loading) {
      const platz = allePlaetze.find(p => p.id === selectedPlatzId);
      if (platz && !platz.gesperrt) {
        loadPlatzData(selectedPlatzId);
      }
    }
  }, [selectedPlatzId, loading, allePlaetze, loadPlatzData]);

  // 3-Stufen-Toggle: leer → verfügbar (✓) → nicht verfügbar (✗) → leer
  async function toggleVerf(slotId: string) {
    if (!currentUser?.id) return;
    setSaving(true);
    const isV = verfuegbarkeit[slotId]?.has(currentUser.id);
    const isNV = nichtVerfuegbar[slotId]?.has(currentUser.id);

    let newStatus: string;
    if (!isV && !isNV) {
      newStatus = 'verfuegbar';
    } else if (isV) {
      newStatus = 'nicht_verfuegbar';
    } else {
      newStatus = 'keine_angabe';
    }

    await apiClient.setVerfuegbarkeit(slotId, newStatus);

    setVerfuegbarkeit(prev => {
      const s = new Set(prev[slotId] || []);
      if (newStatus === 'verfuegbar') s.add(currentUser.id); else s.delete(currentUser.id);
      return { ...prev, [slotId]: s };
    });
    setNichtVerfuegbar(prev => {
      const s = new Set(prev[slotId] || []);
      if (newStatus === 'nicht_verfuegbar') s.add(currentUser.id); else s.delete(currentUser.id);
      return { ...prev, [slotId]: s };
    });
    setSaving(false);
  }

  async function toggleZuw(slotId: string, spielerId: string) {
    const isCurrentlyAssigned = zuweisungen[slotId]?.has(spielerId);
    if (isCurrentlyAssigned) {
      const ok = window.confirm('Weiß dein Mitspieler von der Änderung?');
      if (!ok) return;
    }
    setSaving(true);
    const res = await apiClient.toggleZuweisung(slotId, spielerId);
    if (res.success && res.data) {
      const added = res.data.action === 'added';
      setZuweisungen(prev => {
        const s = new Set(prev[slotId] || []);
        added ? s.add(spielerId) : s.delete(spielerId);
        return { ...prev, [slotId]: s };
      });
      setZuwCounts(prev => ({ ...prev, [spielerId]: (prev[spielerId] || 0) + (added ? 1 : -1) }));
    }
    setSaving(false);
  }

  function fmtDate(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }
  function fmtDay(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short' });
  }

  // NRW Ferien & Feiertage
  function getOstersonntag(year: number): Date {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function getNrwFeiertage(year: number): Set<string> {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const feste = [`${year}-01-01`, `${year}-05-01`, `${year}-10-03`, `${year}-11-01`, `${year}-12-25`, `${year}-12-26`];
    const ostern = getOstersonntag(year);
    const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const bewegliche = [-2, 1, 39, 50, 60].map(n => fmt(addDays(ostern, n)));
    return new Set([...feste, ...bewegliche]);
  }

  function getNrwFerien(): Array<[string, string]> {
    return [
      ['2025-10-13', '2025-10-25'], ['2025-12-22', '2026-01-06'],
      ['2026-03-30', '2026-04-11'], ['2026-05-26', '2026-05-26'],
      ['2026-07-20', '2026-09-01'],
      ['2026-10-17', '2026-10-31'], ['2026-12-23', '2027-01-06'],
      ['2027-03-22', '2027-04-03'], ['2027-05-18', '2027-05-18'],
      ['2027-07-19', '2027-08-31'],
    ];
  }

  function isFeiertagOderFerien(datum: string): { isFerien: boolean; isFeiertag: boolean } {
    const year = parseInt(datum.substring(0, 4));
    const feiertage = getNrwFeiertage(year);
    const isFeiertag = feiertage.has(datum);
    const ferien = getNrwFerien();
    const isFerien = ferien.some(([von, bis]) => datum >= von && datum <= bis);
    return { isFerien, isFeiertag };
  }

  const WOCHENTAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

  if (loading) return <ProtectedRoute><p className="text-gray-500 p-4">Laden...</p></ProtectedRoute>;
  if (!allePlaetze.length) return <ProtectedRoute><p className="text-gray-500 p-4">Keine Plätze gefunden.</p></ProtectedRoute>;

  const selectedPlatz = allePlaetze.find(p => p.id === selectedPlatzId);

  // Platz-Label für Tabs
  function platzLabel(p: PlatzOption) {
    const wt = p.wochentag !== undefined ? WOCHENTAGE_LANG[p.wochentag] : '';
    const trainer = p.trainerName && p.trainerName !== 'ohne' ? ` (${p.trainerName})` : '';
    const saison = p.saisonName ? ` – ${p.saisonName}` : '';
    return `${wt} ${p.uhrzeit}${trainer}${saison}`;
  }

  return (
    <ProtectedRoute>
      {/* Platz-Auswahl als Tabs */}
      {allePlaetze.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {allePlaetze.map(p => (
            <button key={p.id} onClick={() => setSelectedPlatzId(p.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                p.id === selectedPlatzId
                  ? 'bg-blue-600 text-white'
                  : p.gesperrt
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={p.gesperrt}
              title={p.gesperrt ? `Freigabe ab ${p.freigabeDatum}` : ''}>
              {platzLabel(p)}
              {p.gesperrt && ' 🔒'}
            </button>
          ))}
        </div>
      )}

      {/* Gesperrt-Hinweis */}
      {selectedPlatz?.gesperrt ? (
        <div className="max-w-md mx-auto mt-8 bg-amber-50 border border-amber-300 rounded-lg p-6 text-center">
          <p className="text-3xl mb-3">🗓️</p>
          <p className="text-amber-800 font-semibold mb-2">Saisonplanung noch nicht freigegeben</p>
          <p className="text-amber-700 text-sm">Die Planung wird 6 Wochen vor Saisonstart verfügbar.</p>
          <p className="text-amber-700 text-sm mt-1">Freigabe ab: {selectedPlatz.freigabeDatum}</p>
        </div>
      ) : loadingPlatz ? (
        <p className="text-gray-500 p-4">Lade Platz-Daten...</p>
      ) : (
        <>
          {/* Header */}
          <h1 className="text-2xl font-bold mb-4">
            {selectedPlatz?.saisonTyp === 'sommer' ? 'Sommersaisonplanung' : 'Wintersaisonplanung'}{' '}
            {selectedPlatz?.wochentag !== undefined ? WOCHENTAGE_LANG[selectedPlatz.wochentag] : ''}{' '}
            {selectedPlatz?.uhrzeit || ''}{selectedPlatz?.uhrzeitBis ? '–' + selectedPlatz.uhrzeitBis : ''}{' '}
            ({selectedPlatz?.trainerName || 'ohne Trainer'})
          </h1>

          {slots.length === 0 ? (
            <p className="text-gray-500">Keine zukünftigen Termine für diesen Platz.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white z-10 p-2 text-left border-b min-w-[140px]">Spieler</th>
                    {slots.map(slot => {
                      const { isFerien, isFeiertag } = isFeiertagOderFerien(slot.datum);
                      const ferienOrFeiertag = isFerien || isFeiertag;
                      return (
                        <th key={slot.id} className={`p-1 border-b text-center min-w-[44px] ${
                          ferienOrFeiertag ? 'bg-amber-100' : verfuegbarkeit[slot.id]?.has(currentUser?.id || '') ? 'bg-green-50' : 'bg-gray-50'
                        }`}>
                          <div>{fmtDay(slot.datum)}</div>
                          <div>{fmtDate(slot.datum)}</div>
                          {ferienOrFeiertag && <div title={isFeiertag ? 'Feiertag' : 'Schulferien'}>🧳</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={slots.length + 1} className="bg-blue-50 p-2 font-semibold text-blue-800 text-sm">
                      Verfügbarkeit
                    </td>
                  </tr>
                  {spieler.map(sp => (
                    <tr key={`v-${sp.id}`} className="border-b border-gray-100">
                      <td className={`sticky left-0 z-10 p-2 font-medium ${sp.id === currentUser?.id ? 'bg-green-50' : 'bg-white'}`}>
                        {sp.name}
                      </td>
                      {slots.map(slot => {
                        const isMe = sp.id === currentUser?.id;
                        const isV = verfuegbarkeit[slot.id]?.has(sp.id);
                        const isNV = nichtVerfuegbar[slot.id]?.has(sp.id);
                        return (
                          <td key={slot.id} className={`p-1 text-center ${isMe ? 'bg-green-50' : 'bg-gray-50'}`}>
                            {isMe ? (
                              <button type="button" disabled={saving} onClick={() => toggleVerf(slot.id)}
                                className={`w-7 h-7 rounded border text-sm ${
                                  isV ? 'bg-green-500 text-white border-green-600'
                                  : isNV ? 'bg-red-500 text-white border-red-600'
                                  : 'bg-white border-gray-300 hover:bg-gray-100'
                                } disabled:opacity-50`}>
                                {isV ? '✓' : isNV ? '✗' : ''}
                              </button>
                            ) : (
                              <span className={`inline-block w-7 h-7 leading-7 rounded ${
                                isV ? 'bg-green-200 text-green-800'
                                : isNV ? 'bg-red-200 text-red-800'
                                : ''
                              }`}>
                                {isV ? '✓' : isNV ? '✗' : ''}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  <tr>
                    <td colSpan={slots.length + 1} className="bg-orange-50 p-2 font-semibold text-orange-800 text-sm border-t-2 border-orange-300">
                      Zuordnung
                    </td>
                  </tr>
                  {spieler.map(sp => (
                    <tr key={`z-${sp.id}`} className="border-b border-gray-100">
                      <td className={`sticky left-0 z-10 p-2 font-medium ${sp.id === currentUser?.id ? 'bg-green-50' : 'bg-white'}`}>
                        {sp.name} <span className="text-gray-400">({zuwCounts[sp.id] || 0})</span>
                      </td>
                      {slots.map(slot => {
                        const isMe = sp.id === currentUser?.id;
                        const isZ = zuweisungen[slot.id]?.has(sp.id);
                        return (
                          <td key={slot.id} className={`p-1 text-center ${isMe ? 'bg-green-50' : 'bg-gray-50'}`}>
                            <button type="button" disabled={saving} onClick={() => toggleZuw(slot.id, sp.id)}
                              className={`w-7 h-7 rounded border text-sm ${isZ ? 'bg-orange-500 text-white border-orange-600' : 'bg-white border-gray-300 hover:bg-gray-100'} disabled:opacity-50`}>
                              {isZ ? '✓' : ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </ProtectedRoute>
  );
}
