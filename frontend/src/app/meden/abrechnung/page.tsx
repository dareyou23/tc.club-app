'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

type Kategorie = 'baelle' | 'essen' | 'getraenke' | 'sonstiges';

interface Spieltag {
  id: string;
  nr: number;
  datum: string;
  uhrzeit: string;
  gegner: string;
  heimspiel: boolean;
  mannschaft?: number;
}

interface KostenEintrag {
  SK: string;
  spieltagId: string;
  mannschaft: number;
  kategorie: Kategorie;
  betrag: number;
  beschreibung?: string;
  anzahlSpieler: number;
  anteilProSpieler: number;
  erfasstVon: string;
  createdAt: string;
}

interface MeinSaldo {
  gesamt: number;
  details: {
    spieltagId: string;
    mannschaft: number;
    gesamtKosten: number;
    anzahlSpieler: number;
    meinAnteil: number;
    kategorien: { kategorie: string; betrag: number; anteil: number }[];
  }[];
}

const KATEGORIEN: { value: Kategorie; label: string; emoji: string; nurHeim?: boolean }[] = [
  { value: 'baelle', label: 'Bälle', emoji: '🎾', nurHeim: true },
  { value: 'essen', label: 'Essen', emoji: '🍽️', nurHeim: true },
  { value: 'getraenke', label: 'Getränke / Gästerunde', emoji: '🍺' },
  { value: 'sonstiges', label: 'Sonstiges', emoji: '📝' },
];

function formatDatum(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  const tage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return `${tage[d.getDay()]}. ${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.`;
}

function formatEuro(betrag: number) {
  return betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// Kosten-ID aus SK extrahieren (SK = "KOSTEN#uuid")
function kostenIdFromSK(sk: string) {
  return sk.replace('KOSTEN#', '');
}

export default function MedenAbrechnungPage() {
  const { currentUser } = useAuth();
  const [spieltage, setSpieltage] = useState<Spieltag[]>([]);
  const [selectedSpieltag, setSelectedSpieltag] = useState<Spieltag | null>(null);
  const [kosten, setKosten] = useState<KostenEintrag[]>([]);
  const [meinSaldo, setMeinSaldo] = useState<MeinSaldo | null>(null);
  const [saldoListe, setSaldoListe] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'eingabe' | 'saldo' | 'mannschaft'>('eingabe');

  // Formular
  const [kategorie, setKategorie] = useState<Kategorie>('baelle');
  const [betrag, setBetrag] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Mannschafts-Filter für Saldo
  const [saldoMannschaft, setSaldoMannschaft] = useState(1);

  const isVerwalter = currentUser?.rolle === 'trainings_verwalter' || currentUser?.rolle === 'club_manager' || currentUser?.rolle === 'admin';
  const isMF = currentUser?.mannschaftsfuehrer === true;
  const kannErfassen = isMF || isVerwalter;

  useEffect(() => {
    async function load() {
      const [stRes, saldoRes] = await Promise.all([
        apiClient.listMedenSpieltage(),
        apiClient.getMeinSaldo(),
      ]);
      if (stRes.success && stRes.data) {
        setSpieltage(stRes.data);
        // Ersten Spieltag vorauswählen
        if (stRes.data.length > 0) {
          setSelectedSpieltag(stRes.data[0]);
        }
      }
      if (saldoRes.success && saldoRes.data) setMeinSaldo(saldoRes.data);
      setLoaded(true);
    }
    load();
  }, []);

  // Kosten laden wenn Spieltag gewechselt wird
  useEffect(() => {
    if (!selectedSpieltag) return;
    loadKosten(selectedSpieltag.id);
  }, [selectedSpieltag]);

  async function loadKosten(spieltagId: string) {
    const res = await apiClient.getAbrechnung(spieltagId);
    if (res.success && res.data) setKosten(res.data);
  }

  async function loadMeinSaldo() {
    const res = await apiClient.getMeinSaldo();
    if (res.success && res.data) setMeinSaldo(res.data);
  }

  async function loadMannschaftsSaldo(m: number) {
    const res = await apiClient.getSaldo(m);
    if (res.success && res.data) setSaldoListe(res.data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSpieltag) return;
    setError('');
    setSuccess('');
    setSaving(true);

    const betragNum = parseFloat(betrag.replace(',', '.'));
    if (isNaN(betragNum) || betragNum <= 0) {
      setError('Bitte gültigen Betrag eingeben');
      setSaving(false);
      return;
    }

    const res = await apiClient.createAbrechnung(selectedSpieltag.id, {
      kategorie,
      betrag: betragNum,
      beschreibung: beschreibung || undefined,
    });

    if (res.success) {
      setSuccess('Kosten erfasst ✓');
      setBetrag('');
      setBeschreibung('');
      await loadKosten(selectedSpieltag.id);
      await loadMeinSaldo();
      setTimeout(() => setSuccess(''), 3000);
    } else {
      setError(res.error || 'Fehler beim Speichern');
    }
    setSaving(false);
  }

  async function handleDelete(kostenEintrag: KostenEintrag) {
    if (!confirm('Kosteneintrag wirklich löschen?')) return;
    const kostenId = kostenIdFromSK(kostenEintrag.SK);
    const res = await apiClient.deleteAbrechnung(kostenEintrag.spieltagId, kostenId);
    if (res.success) {
      await loadKosten(kostenEintrag.spieltagId);
      await loadMeinSaldo();
    } else {
      alert(res.error || 'Fehler beim Löschen');
    }
  }

  if (!loaded) return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  const gesamtSpieltag = kosten.reduce((sum, k) => sum + k.betrag, 0);
  const verfuegbareKategorien = selectedSpieltag?.heimspiel
    ? KATEGORIEN
    : KATEGORIEN.filter(k => !k.nurHeim);

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold theme-text">Meden-Abrechnung</h1>
          <p className="theme-text-muted mt-1">
            {kannErfassen ? 'Kosten erfassen und Saldo einsehen' : 'Dein Saldo für Meden-Spieltage'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 theme-btn-inactive p-1 rounded-lg">
          {kannErfassen && (
            <button type="button" onClick={() => setTab('eingabe')}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'eingabe' ? 'card theme-link shadow-sm' : 'theme-text-muted hover:theme-text-muted'
              }`}>
              📝 Kosten erfassen
            </button>
          )}
          <button type="button" onClick={() => { setTab('saldo'); loadMeinSaldo(); }}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              tab === 'saldo' ? 'card theme-link shadow-sm' : 'theme-text-muted hover:theme-text-muted'
            }`}>
            💰 Mein Saldo
          </button>
          {kannErfassen && (
            <button type="button" onClick={() => { setTab('mannschaft'); loadMannschaftsSaldo(saldoMannschaft); }}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'mannschaft' ? 'card theme-link shadow-sm' : 'theme-text-muted hover:theme-text-muted'
              }`}>
              👥 Mannschaft
            </button>
          )}
        </div>

        {/* Tab: Kosten erfassen */}
        {tab === 'eingabe' && kannErfassen && (
          <div className="space-y-4">
            {/* Spieltag-Auswahl */}
            <div>
              <label className="block text-sm font-medium theme-text-muted mb-2">Spieltag</label>
              <select
                value={selectedSpieltag?.id || ''}
                onChange={(e) => {
                  const st = spieltage.find(s => s.id === e.target.value);
                  setSelectedSpieltag(st || null);
                }}
                className="w-full border border-dove-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {spieltage.map(st => (
                  <option key={st.id} value={st.id}>
                    M{st.mannschaft} · Nr.{st.nr} · {formatDatum(st.datum)} · {st.heimspiel ? '🏠' : '🚗'} vs {st.gegner}
                  </option>
                ))}
              </select>
            </div>

            {/* Kosten-Formular */}
            <form onSubmit={handleSubmit} className="card-accent p-5 border-blue-300 space-y-4">
              <h3 className="font-semibold theme-text">Neue Kosten erfassen</h3>

              {/* Kategorie */}
              <div>
                <label className="block text-sm font-medium theme-text-muted mb-2">Kategorie</label>
                <div className="grid grid-cols-2 gap-2">
                  {verfuegbareKategorien.map(k => (
                    <button key={k.value} type="button"
                      onClick={() => setKategorie(k.value)}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                        kategorie === k.value
                          ? 'bg-blue-50 border-blue-300 theme-link'
                          : 'card border-dove-300/30 theme-text-muted hover:border-dove-300'
                      }`}>
                      {k.emoji} {k.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Betrag */}
              <div>
                <label className="block text-sm font-medium theme-text-muted mb-1">Gesamtbetrag (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={betrag}
                  onChange={(e) => setBetrag(e.target.value)}
                  placeholder="z.B. 54,00"
                  className="w-full border border-dove-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                {selectedSpieltag && betrag && (
                  <p className="text-xs theme-text-muted mt-1">
                    Wird auf die Spieler der Aufstellung verteilt
                  </p>
                )}
              </div>

              {/* Beschreibung */}
              <div>
                <label className="block text-sm font-medium theme-text-muted mb-1">
                  Beschreibung {kategorie === 'sonstiges' ? '(Pflicht)' : '(optional)'}
                </label>
                <input
                  type="text"
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  placeholder={kategorie === 'baelle' ? 'z.B. 6 Dosen Head Tour' : 'Kurze Beschreibung'}
                  className="w-full border border-dove-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required={kategorie === 'sonstiges'}
                />
              </div>

              {/* Fehler / Erfolg */}
              {error && <p className="text-sm text-accent-red bg-accent-red/10 px-3 py-2 rounded-lg">{error}</p>}
              {success && <p className="text-sm text-accent-green bg-accent-green/10 px-3 py-2 rounded-lg">{success}</p>}

              <button type="submit" disabled={saving}
                className="w-full btn-primary py-2.5 rounded-lg font-medium hover:bg-accent-blue disabled:opacity-50 transition-colors">
                {saving ? 'Speichern...' : 'Kosten erfassen'}
              </button>
            </form>

            {/* Bestehende Kosten für diesen Spieltag */}
            {kosten.length > 0 && (
              <div className="space-y-2">
                <h3 className="section-title">
                  Kosten für diesen Spieltag ({formatEuro(gesamtSpieltag)})
                </h3>
                {kosten.map(k => {
                  const kat = KATEGORIEN.find(ka => ka.value === k.kategorie);
                  return (
                    <div key={k.SK} className="flex items-center justify-between card border border-dove-300/30 rounded-lg px-4 py-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span>{kat?.emoji}</span>
                          <span className="font-medium text-sm">{kat?.label}</span>
                          {k.beschreibung && <span className="text-xs theme-text-muted">— {k.beschreibung}</span>}
                        </div>
                        <p className="text-xs theme-text-subtle mt-0.5">
                          {formatEuro(k.betrag)} ÷ {k.anzahlSpieler} = {formatEuro(k.anteilProSpieler)} pro Spieler
                        </p>
                      </div>
                      <button type="button" onClick={() => handleDelete(k)}
                        className="text-red-400 hover:text-accent-red p-1 ml-2" title="Löschen">
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Mein Saldo */}
        {tab === 'saldo' && meinSaldo && (
          <div className="space-y-4">
            {/* Gesamt-Saldo */}
            <div className="card-accent p-5 border-amber-300">
              <div className="text-center">
                <p className="text-sm theme-text-muted mb-1">Mein Gesamtsaldo</p>
                <p className="text-3xl font-bold theme-text">{formatEuro(meinSaldo.gesamt)}</p>
                <p className="text-xs theme-text-subtle mt-1">
                  über {meinSaldo.details.length} Spieltag{meinSaldo.details.length !== 1 ? 'e' : ''}
                </p>
              </div>
            </div>

            {/* Details pro Spieltag */}
            {meinSaldo.details.length > 0 && (
              <div className="space-y-2">
                <h3 className="section-title">Aufschlüsselung</h3>
                {meinSaldo.details.map((d, i) => {
                  const st = spieltage.find(s => s.id === d.spieltagId);
                  return (
                    <div key={i} className="card border border-dove-300/30 rounded-lg px-4 py-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium theme-text">
                            {st ? `M${st.mannschaft} Nr.${st.nr} · ${formatDatum(st.datum)} vs ${st.gegner}` : `Spieltag ${d.spieltagId}`}
                          </p>
                          <p className="text-xs theme-text-subtle">
                            {formatEuro(d.gesamtKosten)} ÷ {d.anzahlSpieler} Spieler
                          </p>
                        </div>
                        <span className="font-semibold theme-text">{formatEuro(d.meinAnteil)}</span>
                      </div>
                      {d.kategorien.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {d.kategorien.map((k, j) => {
                            const kat = KATEGORIEN.find(ka => ka.value === k.kategorie);
                            return (
                              <span key={j} className="badge theme-btn-inactive theme-text-muted text-xs">
                                {kat?.emoji} {formatEuro(k.anteil)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {meinSaldo.details.length === 0 && (
              <p className="text-center theme-text-subtle py-8">Noch keine Kosten für dich erfasst.</p>
            )}
          </div>
        )}

        {/* Tab: Mannschafts-Saldo */}
        {tab === 'mannschaft' && kannErfassen && (
          <div className="space-y-4">
            {/* Mannschafts-Filter */}
            <div className="flex gap-1 theme-btn-inactive p-1 rounded-lg">
              {[1, 2, 3, 4].map(m => (
                <button key={m} type="button"
                  onClick={() => { setSaldoMannschaft(m); loadMannschaftsSaldo(m); }}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    saldoMannschaft === m
                      ? 'card theme-link shadow-sm'
                      : 'theme-text-muted hover:theme-text-muted'
                  }`}>
                  M{m}
                </button>
              ))}
            </div>

            {/* Saldo-Liste */}
            {saldoListe.length > 0 ? (
              <div className="space-y-2">
                <h3 className="section-title">Saldo M{saldoMannschaft}</h3>
                {saldoListe
                  .sort((a, b) => b.betrag - a.betrag)
                  .map(s => (
                    <div key={s.spielerId} className="flex items-center justify-between card border border-dove-300/30 rounded-lg px-4 py-3">
                      <span className="text-sm font-medium theme-text">{s.name}</span>
                      <span className="font-semibold theme-text">{formatEuro(s.betrag)}</span>
                    </div>
                  ))}
                <div className="flex items-center justify-between theme-btn-inactive border border-dove-300 rounded-lg px-4 py-3 font-bold">
                  <span className="text-sm">Gesamt</span>
                  <span>{formatEuro(saldoListe.reduce((sum, s) => sum + s.betrag, 0))}</span>
                </div>
              </div>
            ) : (
              <p className="text-center theme-text-subtle py-8">Noch keine Kosten für M{saldoMannschaft} erfasst.</p>
            )}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
