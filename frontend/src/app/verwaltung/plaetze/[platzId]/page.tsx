'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export default function PlatzDetailPage() {
  const { platzId } = useParams<{ platzId: string }>();
  const [platz, setPlatz] = useState<any>(null);
  const [gruppe, setGruppe] = useState<any[]>([]);
  const [spieler, setSpieler] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');

  // Edit form state
  const [form, setForm] = useState({
    name: '', uhrzeit: '', uhrzeitBis: '', dauer: 60, ort: '',
    hallengebuehr: 0, trainerkosten: 0, trainerName: '',
    platzTyp: 'training', buchungsmodus: 'faire_verteilung',
    aktiverPlatz: 2, gruppengroesse: 4, anzahlPlaetze: 1,
  });

  useEffect(() => {
    async function load() {
      const [pRes, gRes, sRes] = await Promise.all([
        apiClient.getPlatz(platzId),
        apiClient.getGruppe(platzId),
        apiClient.listSpieler(),
      ]);
      if (pRes.success && pRes.data) {
        setPlatz(pRes.data);
        setForm({
          name: pRes.data.name || '',
          uhrzeit: pRes.data.uhrzeit || '',
          uhrzeitBis: pRes.data.uhrzeitBis || '',
          dauer: pRes.data.dauer || 60,
          ort: pRes.data.ort || '',
          hallengebuehr: pRes.data.hallengebuehr || 0,
          trainerkosten: pRes.data.trainerkosten || 0,
          trainerName: pRes.data.trainerName || '',
          platzTyp: pRes.data.platzTyp || 'training',
          buchungsmodus: pRes.data.buchungsmodus || 'faire_verteilung',
          aktiverPlatz: pRes.data.aktiverPlatz || 2,
          gruppengroesse: pRes.data.gruppengroesse || 4,
          anzahlPlaetze: pRes.data.anzahlPlaetze || 1,
        });
      }
      if (gRes.success && gRes.data) setGruppe(gRes.data);
      if (sRes.success && sRes.data) setSpieler(sRes.data);
      setLoading(false);
    }
    load();
  }, [platzId]);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    const data: any = { ...form };
    if (!data.uhrzeitBis) data.uhrzeitBis = null;
    if (!data.trainerName) data.trainerName = null;
    if (!data.trainerkosten) data.trainerkosten = null;
    const res = await apiClient.updatePlatz(platzId, data);
    if (res.success) {
      setMsg('✅ Gespeichert');
      setPlatz(res.data);
    } else {
      setMsg(`❌ ${res.error}`);
    }
    setSaving(false);
  };

  const handleAdd = async (spielerId: string) => {
    const res = await apiClient.addToGruppe(platzId, spielerId);
    if (res.success) {
      const gRes = await apiClient.getGruppe(platzId);
      if (gRes.success && gRes.data) setGruppe(gRes.data);
    }
  };

  const handleRemove = async (spielerId: string) => {
    if (!confirm('Spieler wirklich aus der Gruppe entfernen?')) return;
    const res = await apiClient.removeFromGruppe(platzId, spielerId);
    if (res.success) setGruppe(prev => prev.filter(g => g.spielerId !== spielerId));
  };

  const gruppeIds = new Set(gruppe.map(g => g.spielerId));
  const verfuegbar = spieler.filter(s => s.aktiv && !gruppeIds.has(s.id));

  const inputCls = "w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <ProtectedRoute allowedRoles={['trainings_verwalter', 'admin']}>
      <h1 className="text-2xl font-bold mb-4">Platz bearbeiten</h1>

      {loading ? <p className="text-gray-500">Laden...</p> : (
        <>
          {/* Platz-Einstellungen */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h2 className="font-semibold mb-3">Einstellungen</h2>
            {platz && (
              <p className="text-xs text-gray-400 mb-3">
                {WOCHENTAGE[platz.wochentag]} · Erstellt am {new Date(platz.createdAt).toLocaleDateString('de-DE')}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label htmlFor="platz-name" className={labelCls}>Name</label>
                <input id="platz-name" className={inputCls} value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="platz-uhrzeit" className={labelCls}>Uhrzeit von</label>
                <input id="platz-uhrzeit" type="time" className={inputCls} value={form.uhrzeit}
                  onChange={e => setForm(f => ({ ...f, uhrzeit: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="platz-uhrzeitBis" className={labelCls}>Uhrzeit bis</label>
                <input id="platz-uhrzeitBis" type="time" className={inputCls} value={form.uhrzeitBis}
                  onChange={e => setForm(f => ({ ...f, uhrzeitBis: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="platz-dauer" className={labelCls}>Dauer (Min)</label>
                <input id="platz-dauer" type="number" className={inputCls} value={form.dauer}
                  onChange={e => setForm(f => ({ ...f, dauer: parseInt(e.target.value) || 60 }))} />
              </div>
              <div>
                <label htmlFor="platz-ort" className={labelCls}>Ort</label>
                <input id="platz-ort" className={inputCls} value={form.ort}
                  onChange={e => setForm(f => ({ ...f, ort: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="platz-hallengebuehr" className={labelCls}>Hallengebühr (€)</label>
                <input id="platz-hallengebuehr" type="number" step="0.01" className={inputCls} value={form.hallengebuehr}
                  onChange={e => setForm(f => ({ ...f, hallengebuehr: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label htmlFor="platz-trainerkosten" className={labelCls}>Trainerkosten (€)</label>
                <input id="platz-trainerkosten" type="number" step="0.01" className={inputCls} value={form.trainerkosten}
                  onChange={e => setForm(f => ({ ...f, trainerkosten: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label htmlFor="platz-trainerName" className={labelCls}>Trainername</label>
                <input id="platz-trainerName" className={inputCls} value={form.trainerName} placeholder="leer = ohne Trainer"
                  onChange={e => setForm(f => ({ ...f, trainerName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="platz-anzahlPlaetze" className={labelCls}>Anzahl Plätze</label>
                <input id="platz-anzahlPlaetze" type="number" className={inputCls} value={form.anzahlPlaetze}
                  onChange={e => setForm(f => ({ ...f, anzahlPlaetze: parseInt(e.target.value) || 1 }))} />
              </div>
              <div>
                <label htmlFor="platz-gruppengroesse" className={labelCls}>Gruppengröße</label>
                <input id="platz-gruppengroesse" type="number" className={inputCls} value={form.gruppengroesse}
                  onChange={e => setForm(f => ({ ...f, gruppengroesse: parseInt(e.target.value) || 4 }))} />
              </div>
              <div>
                <label htmlFor="platz-aktiverPlatz" className={labelCls}>Aktive Plätze</label>
                <input id="platz-aktiverPlatz" type="number" className={inputCls} value={form.aktiverPlatz}
                  onChange={e => setForm(f => ({ ...f, aktiverPlatz: parseInt(e.target.value) || 2 }))} />
              </div>
              <div>
                <label htmlFor="platz-buchungsmodus" className={labelCls}>Buchungsmodus</label>
                <select id="platz-buchungsmodus" className={inputCls} value={form.buchungsmodus}
                  onChange={e => setForm(f => ({ ...f, buchungsmodus: e.target.value }))}>
                  <option value="faire_verteilung">Faire Verteilung</option>
                  <option value="spontan_anmeldung">Spontan-Anmeldung</option>
                </select>
              </div>
              <div>
                <label htmlFor="platz-platzTyp" className={labelCls}>Platz-Typ</label>
                <select id="platz-platzTyp" className={inputCls} value={form.platzTyp}
                  onChange={e => setForm(f => ({ ...f, platzTyp: e.target.value }))}>
                  <option value="training">Training</option>
                  <option value="saisonplanung">Saisonplanung</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={handleSave} disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
              {msg && <span className="text-sm">{msg}</span>}
            </div>
          </div>

          {/* Buchungsgruppe */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h2 className="font-semibold mb-3">Buchungsgruppe ({gruppe.length})</h2>
            {gruppe.length === 0 ? (
              <p className="text-gray-500 text-sm">Noch keine Spieler zugeordnet.</p>
            ) : (
              <div className="space-y-2">
                {gruppe
                  .sort((a, b) => (a.spielerName || '').localeCompare(b.spielerName || '', 'de'))
                  .map(g => (
                  <div key={g.spielerId} className="flex justify-between items-center py-2 border-b last:border-0">
                    <span>{g.spielerName}</span>
                    <button onClick={() => handleRemove(g.spielerId)}
                      className="text-red-600 text-sm hover:underline">Entfernen</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold mb-3">Spieler hinzufügen</h2>
            <input type="text" placeholder="🔍 Spieler suchen..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3" />
            {verfuegbar.length === 0 ? (
              <p className="text-gray-500 text-sm">Alle aktiven Spieler sind bereits in der Gruppe.</p>
            ) : (
              <div className="space-y-2">
                {verfuegbar
                  .filter(s => {
                    if (!search) return true;
                    const q = search.toLowerCase();
                    return `${s.vorname} ${s.name}`.toLowerCase().includes(q);
                  })
                  .sort((a, b) => (a.vorname || '').localeCompare(b.vorname || '', 'de'))
                  .map(s => (
                  <div key={s.id} className="flex justify-between items-center py-2 border-b last:border-0">
                    <span>{s.vorname} {s.name}</span>
                    <button onClick={() => handleAdd(s.id)}
                      className="text-blue-600 text-sm hover:underline">Hinzufügen</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </ProtectedRoute>
  );
}
