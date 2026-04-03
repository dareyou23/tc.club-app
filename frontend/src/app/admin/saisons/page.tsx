'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function AdminSaisonsPage() {
  const [saisons, setSaisons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', typ: 'winter', startDatum: '', endDatum: '' });

  useEffect(() => { loadSaisons(); }, []);

  async function loadSaisons() {
    const res = await apiClient.listSaisons();
    if (res.success && res.data) setSaisons(res.data);
    setLoading(false);
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiClient.createSaison(form);
    if (res.success) { setShowForm(false); loadSaisons(); }
  };

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Saison-Verwaltung</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">
          {showForm ? 'Abbrechen' : '+ Neue Saison'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4 mb-4 grid grid-cols-2 gap-3">
          <input placeholder="Name (z.B. Winter 2025/26)" value={form.name} required
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="px-3 py-2 border rounded col-span-2" />
          <select value={form.typ} onChange={e => setForm({ ...form, typ: e.target.value })}
            className="px-3 py-2 border rounded">
            <option value="winter">Winter</option>
            <option value="sommer">Sommer</option>
          </select>
          <div />
          <input type="date" value={form.startDatum} required
            onChange={e => setForm({ ...form, startDatum: e.target.value })}
            className="px-3 py-2 border rounded" />
          <input type="date" value={form.endDatum} required
            onChange={e => setForm({ ...form, endDatum: e.target.value })}
            className="px-3 py-2 border rounded" />
          <button type="submit" className="bg-green-600 text-white py-2 rounded hover:bg-green-700 col-span-2">
            Saison anlegen
          </button>
        </form>
      )}

      {loading ? <p className="text-gray-500">Laden...</p> : (
        <div className="space-y-3">
          {saisons.map(s => (
            <div key={s.id} className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                <p className="text-sm text-gray-600">
                  {s.startDatum} bis {s.endDatum}
                </p>
              </div>
              <span className={`px-3 py-1 rounded text-sm ${
                s.status === 'aktiv' ? 'bg-green-100 text-green-700' :
                s.status === 'geplant' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </ProtectedRoute>
  );
}
