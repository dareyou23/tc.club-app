'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function KostenPage() {
  const [konten, setKonten] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await apiClient.getMeinKostenkonto();
      if (res.success && res.data) setKonten(res.data);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <ProtectedRoute>
      <h1 className="text-2xl font-bold mb-4">Meine Kosten</h1>
      {loading ? (
        <p className="text-gray-500">Laden...</p>
      ) : konten.length === 0 ? (
        <p className="text-gray-500">Noch keine Kosten angefallen.</p>
      ) : (
        <div className="space-y-4">
          {konten.map((k, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-gray-500">Hallengebühren</p>
                  <p className="text-xl font-bold">{k.hallengebuehren?.toFixed(2)}€</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Trainerkosten</p>
                  <p className="text-xl font-bold">{k.trainerkosten?.toFixed(2)}€</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Gesamt</p>
                  <p className="text-xl font-bold text-blue-600">{k.gesamtkosten?.toFixed(2)}€</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ProtectedRoute>
  );
}
