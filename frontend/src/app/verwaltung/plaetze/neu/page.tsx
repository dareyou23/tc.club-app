'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export default function NeueTrainingszeitPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saisons, setSaisons] = useState<any[]>([]);
  const [selectedSaisons, setSelectedSaisons] = useState<Set<string>>(new Set());
  const [spieler, setSpieler] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Formular
  const [trainerName, setTrainerName] = useState('');
  const [wochentag, setWochentag] = useState<number | ''>('');
  const [halleNr, setHalleNr] = useState('');
  const [uhrzeitVon, setUhrzeitVon] = useState('');
  const [uhrzeitBis, setUhrzeitBis] = useState('');
  const [nurHallentraining, setNurHallentraining] = useState(false);
  const [selectedSpieler, setSelectedSpieler] = useState<Set<string>>(new Set());

  // Erkennung ob Sommersaison ausgewählt ist (mindestens eine)
  const isSommer = saisons.some(s => selectedSaisons.has(s.id) && /sommer/i.test(s.name));

  useEffect(() => {
    async function load() {
      const [saisonsRes, spielerRes] = await Promise.all([
        apiClient.listSaisons(),
        apiClient.listSpieler(),
      ]);
      if (saisonsRes.success && saisonsRes.data) {
        // Nur aktive und geplante Saisons anzeigen (archivierte ausblenden)
        const relevant = saisonsRes.data.filter((s: any) => s.status === 'aktiv' || s.status === 'geplant');
        setSaisons(relevant);
        // Laufende Saison automatisch vorauswählen
        const today = new Date().toISOString().split('T')[0];
        const laufende = relevant.find((s: any) => s.startDatum <= today && s.endDatum >= today);
        if (laufende) setSelectedSaisons(new Set([laufende.id]));
      }
      if (spielerRes.success && spielerRes.data) {
        const filtered = spielerRes.data
          .filter((s: any) => s.aktiv && s.rolle !== 'admin')
          .sort((a: any, b: any) => {
            const nameA = `${a.name} ${a.vorname}`.toLowerCase();
            const nameB = `${b.name} ${b.vorname}`.toLowerCase();
            return nameA.localeCompare(nameB);
          });
        setSpieler(filtered);
      }
      setLoadingData(false);
    }
    load();
  }, []);


  const toggleSaison = (id: string) => {
    setSelectedSaisons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSpieler = (id: string) => {
    setSelectedSpieler(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedSpieler.size === spieler.length) {
      setSelectedSpieler(new Set());
    } else {
      setSelectedSpieler(new Set(spieler.map(s => s.id)));
    }
  };

  const berechneMinuten = (von: string, bis: string): number => {
    if (!von || !bis) return 60;
    const [hV] = von.split(':').map(Number);
    const [hB] = bis.split(':').map(Number);
    return (hB - hV) * 60;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (wochentag === '') { setError('Bitte Wochentag auswählen'); return; }
    if (!halleNr.trim()) { setError(isSommer ? 'Bitte Platz Nr. eingeben' : 'Bitte Halle Nr. eingeben'); return; }
    if (!uhrzeitVon || !uhrzeitBis) { setError('Bitte Uhrzeit von und bis eingeben'); return; }
    if (selectedSaisons.size === 0) { setError('Bitte mindestens eine Saison auswählen'); return; }

    const dauer = berechneMinuten(uhrzeitVon, uhrzeitBis);
    if (dauer <= 0) { setError('Uhrzeit "bis" muss nach "von" liegen'); return; }

    const ortLabel = isSommer ? 'Platz' : 'Halle';
    const name = `${ortLabel} ${halleNr} ${WOCHENTAGE[wochentag as number]} ${uhrzeitVon}${trainerName ? ` (${trainerName})` : ''}`;

    setSaving(true);
    try {
      // Für jede ausgewählte Saison einen Platz anlegen
      for (const saisonId of selectedSaisons) {
        const res = await apiClient.createPlatz({
          saisonId,
          name,
          wochentag,
          uhrzeit: uhrzeitVon,
          uhrzeitBis,
          dauer,
          ort: `${ortLabel} ${halleNr}`,
          hallengebuehr: 0,
          trainerkosten: trainerName ? 0 : null,
          trainerName: trainerName || undefined,
          nurHallentraining,
          buchungsmodus: 'faire_verteilung',
          aktiverPlatz: 4,
          gruppengroesse: Math.max(selectedSpieler.size, 4),
        });

        if (res.success && res.data?.id) {
          for (const spielerId of selectedSpieler) {
            await apiClient.addToGruppe(res.data.id, spielerId);
          }
        } else {
          setError(res.error || 'Fehler beim Anlegen');
          setSaving(false);
          return;
        }
      }
      router.push('/verwaltung/plaetze');
    } catch {
      setError('Fehler beim Anlegen');
    } finally {
      setSaving(false);
    }
  };


  return (
    <ProtectedRoute allowedRoles={['trainings_verwalter', 'admin']}>
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold mb-4">Neue Trainingszeit</h1>

        {saisons.length === 0 && !loadingData && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-4 text-sm text-yellow-800">
            Keine Saisons verfügbar. Bitte versuche es erneut.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-5 space-y-4">
          {/* Saison-Auswahl (Checkboxen) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Saison <span className="text-red-500">*</span>
            </label>
            {loadingData ? (
              <p className="text-gray-500 text-sm">Laden...</p>
            ) : (
              <div className="space-y-2">
                {saisons.map(s => (
                  <label key={s.id} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox"
                      checked={selectedSaisons.has(s.id)}
                      onChange={() => toggleSaison(s.id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    <span className="text-sm">
                      {s.name}
                      <span className="text-gray-400 ml-1">({s.startDatum} – {s.endDatum})</span>
                      {s.status === 'aktiv' && <span className="ml-1 text-green-600 text-xs">(laufend)</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Trainer (optional) */}
          <div>
            <label htmlFor="trainer" className="block text-sm font-medium text-gray-700 mb-1">
              Trainer <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input id="trainer" type="text" value={trainerName}
              onChange={e => setTrainerName(e.target.value)}
              placeholder="z.B. Thomas Müller"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Wochentag (Pflicht) */}
          <div>
            <label htmlFor="wochentag" className="block text-sm font-medium text-gray-700 mb-1">
              Wochentag <span className="text-red-500">*</span>
            </label>
            <select id="wochentag" value={wochentag}
              onChange={e => setWochentag(e.target.value === '' ? '' : parseInt(e.target.value))}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Bitte wählen...</option>
              {WOCHENTAGE.map((tag, i) => (
                <option key={i} value={i}>{tag}</option>
              ))}
            </select>
          </div>

          {/* Halle Nr / Platz Nr (Pflicht) */}
          <div>
            <label htmlFor="halleNr" className="block text-sm font-medium text-gray-700 mb-1">
              {isSommer ? 'Platz Nr.' : 'Halle Nr.'} <span className="text-red-500">*</span>
            </label>
            <input id="halleNr" type="text" value={halleNr}
              onChange={e => setHalleNr(e.target.value)}
              placeholder={isSommer ? 'z.B. 5' : 'z.B. 3'}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>


          {/* Uhrzeit von - bis (Pflicht) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Uhrzeit <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <select value={uhrzeitVon}
                onChange={e => setUhrzeitVon(e.target.value)}
                required aria-label="Uhrzeit von"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Von</option>
                {Array.from({ length: 16 }, (_, i) => i + 7).map(h => (
                  <option key={h} value={`${h.toString().padStart(2, '0')}:00`}>{h}:00</option>
                ))}
              </select>
              <span className="text-gray-500">bis</span>
              <select value={uhrzeitBis}
                onChange={e => setUhrzeitBis(e.target.value)}
                required aria-label="Uhrzeit bis"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Bis</option>
                {Array.from({ length: 16 }, (_, i) => i + 8).map(h => (
                  <option key={h} value={`${h.toString().padStart(2, '0')}:00`}>{h}:00</option>
                ))}
              </select>
            </div>
            {uhrzeitVon && uhrzeitBis && berechneMinuten(uhrzeitVon, uhrzeitBis) > 0 && (
              <p className="text-xs text-gray-500 mt-1">{berechneMinuten(uhrzeitVon, uhrzeitBis) / 60} Stunde{berechneMinuten(uhrzeitVon, uhrzeitBis) > 60 ? 'n' : ''}</p>
            )}
          </div>

          {/* Ausschließlich Hallentraining */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox"
                checked={nurHallentraining}
                onChange={e => setNurHallentraining(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
              <span className="text-sm font-medium text-gray-700">Ausschließlich Hallentraining</span>
            </label>
          </div>

          {/* Spielerauswahl */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Spieler auswählen ({selectedSpieler.size} ausgewählt)
              </label>
              <button type="button" onClick={selectAll}
                className="text-xs text-blue-600 hover:text-blue-800">
                {selectedSpieler.size === spieler.length ? 'Keine auswählen' : 'Alle auswählen'}
              </button>
            </div>
            {loadingData ? (
              <p className="text-gray-500 text-sm">Laden...</p>
            ) : spieler.length === 0 ? (
              <p className="text-gray-500 text-sm">Keine Spieler vorhanden.</p>
            ) : (
              <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
                {spieler.map(s => (
                  <label key={s.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                    <input type="checkbox"
                      checked={selectedSpieler.has(s.id)}
                      onChange={() => toggleSpieler(s.id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    <span className="text-sm">{s.name}, {s.vorname}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => router.push('/verwaltung/plaetze')}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm">
              Abbrechen
            </button>
            <button type="submit" disabled={saving || selectedSaisons.size === 0}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm">
              {saving ? 'Wird angelegt...' : 'Trainingszeit anlegen'}
            </button>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}