'use client';

import ProtectedRoute from '@/components/ProtectedRoute';

export default function StundenkontoPage() {
  return (
    <ProtectedRoute>
      <h1 className="text-2xl font-bold mb-4">Mein Stundenkonto</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">
          Hier wird dein Stundenkonto für die aktuelle Saison angezeigt,
          inklusive Vergleich mit den anderen Spielern deiner Buchungsgruppe.
        </p>
      </div>
    </ProtectedRoute>
  );
}
