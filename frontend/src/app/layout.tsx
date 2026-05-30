import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/AuthContext';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Tennis-Club-App',
  description: 'Verwaltung von Trainings und Mannschaften',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen theme-body">
        <AuthProvider>
          <Navigation />
          <main className="max-w-3xl mx-auto px-4 py-6">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
