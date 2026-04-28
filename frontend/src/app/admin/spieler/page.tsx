'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function AdminSpielerPage() {
  const { impersonate, currentUser } = useAuth();
  const router = useRouter();
  const isAdmin = currentUser?.rolle === 'admin';
  const isVerwalter = currentUser?.rolle === 'trainings_verwalter' || currentUser?.rolle === 'club_manager' || isAdmin;
  const isMF = currentUser?.mannschaftsfuehrer === true;
  const canEdit = isVerwalter;
  const canDelete = isAdmin; // Nur Admin darf löschen
  const canCreate = isAdmin || currentUser?.rolle === 'trainings_verwalter'; // club_manager darf nur Trainierende
  const [spieler, setSpieler] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<string>('setzlistePosition');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [form, setForm] = useState({ name: '', vorname: '', email: '', password: '', rolle: 'spieler' });

  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);

  // PW direkt setzen (analog Meden-Manager)
  const [pwModal, setPwModal] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [festspielMap, setFestspielMap] = useState<Record<string, { festgespielt: boolean; festgespieltIn: number[] }>>({});

  useEffect(() => {
    loadSpieler();
  }, []);

  async function loadSpieler() {
    const [res, fsRes] = await Promise.all([
      apiClient.listSpieler(),
      apiClient.getFestspielStatus(),
    ]);
    if (res.success && res.data) setSpieler(res.data);
    if (fsRes.success && fsRes.data) {
      const map: Record<string, { festgespielt: boolean; festgespieltIn: number[] }> = {};
      for (const fs of fsRes.data) {
        if (fs.mannschaften && fs.mannschaften.length > 0) {
          map[fs.spielerId] = { festgespielt: fs.festgespielt, festgespieltIn: fs.festgespieltIn || [] };
        }
      }
      setFestspielMap(map);
    }
    setLoading(false);
  }

  const handleDelete = async (s: any) => {
    if (!confirm(`Spieler "${s.vorname} ${s.name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    setDeleting(s.id);
    const res = await apiClient.deleteSpieler(s.id);
    setDeleting(null);
    if (res.success) loadSpieler();
  };

  const handleResetPassword = async (s: any) => {
    if (!confirm(`Passwort von "${s.vorname} ${s.name}" zurücksetzen?`)) return;
    setResetting(s.id);
    const res = await apiClient.resetPassword(s.email);
    setResetting(null);
    if (res.success && res.data?.temporaryPassword) {
      setResetResult({ email: s.email, password: res.data.temporaryPassword });
    }
  };

  const handleSetPassword = async () => {
    if (!pwModal || !newPassword || newPassword.length < 6) return;
    setPwSaving(true);
    try {
      const res = await apiClient.setPassword(pwModal.id, newPassword);
      if (res.success) {
        setPwSuccess(true);
        setTimeout(() => { setPwModal(null); setNewPassword(''); setPwSuccess(false); }, 1500);
      } else {
        alert(res.error || 'Fehler beim Setzen des Passworts');
      }
    } catch {
      alert('Fehler beim Setzen des Passworts');
    } finally {
      setPwSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiClient.createSpieler(form);
    if (res.success) {
      setShowForm(false);
      setForm({ name: '', vorname: '', email: '', password: '', rolle: 'spieler' });
      loadSpieler();
    }
  };

  if (!isVerwalter && !isMF) {
    return <ProtectedRoute allowedRoles={['trainings_verwalter', 'admin']}><div /></ProtectedRoute>;
  }

  return (
    <ProtectedRoute>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Spieler-Verwaltung</h1>
        <button type="button" onClick={() => setShowForm(!showForm)}
          className={`bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm ${canCreate ? '' : 'hidden'}`}>
          {showForm ? 'Abbrechen' : '+ Neuer Spieler'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4 mb-4 grid grid-cols-2 gap-3">
          <input placeholder="Vorname" value={form.vorname} required
            onChange={e => setForm({ ...form, vorname: e.target.value })}
            className="px-3 py-2 border rounded" />
          <input placeholder="Name" value={form.name} required
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="px-3 py-2 border rounded" />
          <input placeholder="E-Mail" type="email" value={form.email} required
            onChange={e => setForm({ ...form, email: e.target.value })}
            className="px-3 py-2 border rounded" />
          <input placeholder="Passwort" type="password" value={form.password} required
            onChange={e => setForm({ ...form, password: e.target.value })}
            className="px-3 py-2 border rounded" />
          <select value={form.rolle} onChange={e => setForm({ ...form, rolle: e.target.value })}
            aria-label="Rolle" className="px-3 py-2 border rounded">
            <option value="spieler">Spieler</option>
            <option value="trainings_verwalter">Trainingsverwalter</option>
            <option value="club_manager">Club Manager</option>
            {isAdmin && <option value="admin">Admin</option>}
          </select>
          <button type="submit" className="bg-green-600 text-white py-2 rounded hover:bg-green-700">
            Anlegen
          </button>
        </form>
      )}

      {/* Temporäres Passwort Modal nach Reset */}
      {resetResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full text-center">
            <p className="text-sm text-gray-600 mb-1">Passwort zurückgesetzt für</p>
            <p className="font-medium mb-3">{resetResult.email}</p>
            <p className="text-3xl font-mono font-bold text-blue-900 bg-blue-50 rounded p-3 mb-3 select-all">{resetResult.password}</p>
            <p className="text-xs text-gray-500 mb-4">Bitte teilen Sie das temporäre Passwort dem Spieler persönlich mit.</p>
            <button type="button" onClick={() => setResetResult(null)}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
              Verstanden
            </button>
          </div>
        </div>
      )}

      {loading ? <p className="text-gray-500">Laden...</p> : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-3 border-b">
            <input
              type="text"
              placeholder="🔍 Spieler suchen..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  { key: 'setzlistePosition', label: 'Ra.', width: 'min-w-[60px]' },
                  { key: 'id', label: 'ID-Nr.', width: 'min-w-[100px]' },
                  { key: 'vorname', label: 'Name', width: 'min-w-[140px]' },
                  { key: 'mannschaftsfuehrer', label: 'MF', width: 'min-w-[40px]' },
                  { key: 'lk', label: 'LK', width: 'min-w-[60px]' },
                  { key: 'kern', label: 'Kern', width: 'min-w-[60px]' },
                  { key: 'email', label: 'E-Mail', width: 'min-w-[180px]' },
                  { key: 'rolle', label: 'Rolle', width: 'min-w-[120px]' },
                  ...(isAdmin ? [{ key: 'lastLogin', label: 'Login', width: 'min-w-[80px]' }] : []),
                ].map(col => (
                  <th key={col.key}
                    onClick={() => { if (sortBy === col.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(col.key); setSortDir('asc'); } }}
                    className={`text-left p-3 ${col.width} cursor-pointer hover:bg-gray-100 select-none`}>
                    {col.label} {sortBy === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                ))}
                <th className="text-left p-3 min-w-[200px]">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filtered = spieler
                  .filter(s => {
                    if (!isAdmin && s.rolle === 'admin') return false;
                    if (!search) return true;
                    const q = search.toLowerCase();
                    return `${s.vorname} ${s.name}`.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.id?.includes(q);
                  })
                  .sort((a, b) => {
                    let va = a[sortBy], vb = b[sortBy];
                    if (sortBy === 'setzlistePosition' || sortBy === 'lk') {
                      va = Number(va) || 999; vb = Number(vb) || 999;
                    }
                    if (sortBy === 'vorname') { va = `${a.vorname} ${a.name}`; vb = `${b.vorname} ${b.name}`; }
                    if (va < vb) return sortDir === 'asc' ? -1 : 1;
                    if (va > vb) return sortDir === 'asc' ? 1 : -1;
                    return 0;
                  });

                const getMannschaft = (ra: number | undefined) => {
                  if (!ra || ra < 1) return null;
                  if (ra <= 6) return { nr: 1, label: '1. Mannschaft', color: 'bg-blue-50' };
                  if (ra <= 12) return { nr: 2, label: '2. Mannschaft', color: 'bg-green-50' };
                  if (ra <= 18) return { nr: 3, label: '3. Mannschaft', color: 'bg-yellow-50' };
                  return { nr: 4, label: '4. Mannschaft', color: 'bg-gray-50' };
                };

                const isSortByRang = sortBy === 'setzlistePosition' && sortDir === 'asc';
                let lastMannschaft = 0;
                const rows: React.ReactNode[] = [];

                filtered.forEach((s, idx) => {
                  const m = getMannschaft(s.setzlistePosition);
                  const mNr = m?.nr || 0;

                  // Mannschafts-Trenner einfügen (nur bei Rang-Sortierung)
                  if (isSortByRang && mNr > 0 && mNr !== lastMannschaft) {
                    if (lastMannschaft > 0) {
                      rows.push(<tr key={`sep-${mNr}`}><td colSpan={99} className="border-t-4 border-gray-800 p-0" /></tr>);
                    }
                    rows.push(
                      <tr key={`label-${mNr}`} className={m!.color}>
                        <td colSpan={99} className="px-3 py-1.5 text-xs font-bold text-gray-700 uppercase tracking-wide">
                          {m!.label}
                        </td>
                      </tr>
                    );
                    lastMannschaft = mNr;
                  }

                  const rowBg = isSortByRang && m ? m.color : '';
                  rows.push(
                <tr key={s.id} className={`border-t ${rowBg}`}>
                  <td className="p-3 text-sm text-gray-600">{s.setzlistePosition || '-'}</td>
                  <td className="p-3 text-sm font-mono text-gray-600">{s.id}</td>
                  <td className="p-3 text-sm font-medium">
                    {s.vorname} {s.name}
                    {festspielMap[s.id]?.festgespielt && (
                      <span className="ml-1 text-red-600" title={`Festgespielt in M${festspielMap[s.id].festgespieltIn.join(',')}`}>🔒</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <input type="checkbox" checked={!!s.mannschaftsfuehrer}
                      onChange={async () => {
                        if (!canEdit) return;
                        await apiClient.updateSpieler(s.id, { mannschaftsfuehrer: !s.mannschaftsfuehrer });
                        loadSpieler();
                      }}
                      disabled={!canEdit}
                      className={`w-4 h-4 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'} accent-blue-600`}
                      title={s.mannschaftsfuehrer ? 'Mannschaftsführer entfernen' : 'Als Mannschaftsführer setzen'} />
                  </td>
                  <td className="p-3 text-sm text-gray-600 font-mono text-right tabular-nums">{s.lk ? Number(s.lk).toFixed(1) : '-'}</td>
                  <td className="p-3 text-sm text-center">
                    <button type="button" onClick={async () => {
                      if (!canEdit && !isMF) return;
                      const next = s.kern ? (s.kern < 4 ? s.kern + 1 : undefined) : 1;
                      await apiClient.updateSpieler(s.id, { kern: next || null });
                      loadSpieler();
                    }} disabled={!canEdit && !isMF} className={`px-2 py-0.5 rounded text-xs font-medium ${(canEdit || isMF) ? 'cursor-pointer' : 'cursor-not-allowed'} ${
                      s.kern === 1 ? 'bg-blue-200 text-blue-800' :
                      s.kern === 2 ? 'bg-green-200 text-green-800' :
                      s.kern === 3 ? 'bg-yellow-200 text-yellow-800' :
                      s.kern === 4 ? 'bg-gray-200 text-gray-800' :
                      'bg-gray-100 text-gray-400'
                    }`}>{s.kern ? `M${s.kern}` : '—'}</button>
                  </td>
                  <td className="p-3 text-sm text-gray-600">{s.email}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      s.rolle === 'admin' ? 'bg-red-100 text-red-700' :
                      s.rolle === 'club_manager' ? 'bg-purple-100 text-purple-700' :
                      s.rolle === 'trainings_verwalter' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{s.rolle}</span>
                  </td>
                  {isAdmin && (
                    <td className="p-3 text-xs text-gray-500">
                      {s.lastLogin ? new Date(s.lastLogin).toLocaleDateString('de-DE') : '—'}
                    </td>
                  )}
                  <td className="p-3 flex gap-2">
                    {isAdmin && (
                      <button type="button"
                        onClick={async () => {
                          const res = await impersonate(s.id);
                          if (res.success) router.push('/');
                        }}
                        className="text-purple-600 hover:text-purple-800 text-xs"
                        title={`Als ${s.vorname} ${s.name} anmelden`}>
                        👤
                      </button>
                    )}
                    <button type="button"
                      onClick={() => setPwModal({ id: s.id, name: `${s.vorname} ${s.name}` })}
                      className="text-blue-600 hover:text-blue-800 text-xs"
                      title={`Passwort für ${s.vorname} ${s.name} setzen`}>
                      🔑
                    </button>
                    <button type="button" onClick={() => handleResetPassword(s)} disabled={resetting === s.id}
                      className="text-orange-600 hover:text-orange-800 text-xs disabled:opacity-50">
                      {resetting === s.id ? 'Reset...' : 'PW Reset'}
                    </button>
                    <button type="button" onClick={() => handleDelete(s)} disabled={deleting === s.id}
                      className={`text-red-600 hover:text-red-800 text-xs disabled:opacity-50 ${canDelete ? '' : 'hidden'}`}>
                      {deleting === s.id ? 'Löschen...' : 'Löschen'}
                    </button>
                  </td>
                </tr>
                  );
                });
                return rows;
              })()}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* PW direkt setzen Modal */}
      {pwModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
            {pwSuccess ? (
              <div className="text-center">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-green-700 font-medium">Passwort gesetzt</p>
              </div>
            ) : (
              <>
                <h3 className="font-semibold text-lg mb-1">Passwort setzen</h3>
                <p className="text-sm text-gray-600 mb-4">{pwModal.name}</p>
                <input
                  type="text"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Neues Passwort (min. 8 Zeichen)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                  minLength={8}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mb-4">Groß- und Kleinbuchstaben + Zahl erforderlich</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setPwModal(null); setNewPassword(''); }}
                    className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm">
                    Abbrechen
                  </button>
                  <button type="button" onClick={handleSetPassword}
                    disabled={pwSaving || newPassword.length < 8}
                    className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm">
                    {pwSaving ? 'Speichern...' : 'Setzen'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
