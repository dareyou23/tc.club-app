'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/AuthContext';
import { usePathname } from 'next/navigation';
import { apiClient } from '@/lib/api';

export default function Navigation() {
  const { currentUser, logout, isAuthenticated, isImpersonating, stopImpersonating } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hatTrainingsgruppe, setHatTrainingsgruppe] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchCount = async () => {
      const res = await apiClient.getUnreadCount();
      if (res.success && res.data) setUnreadCount(res.data.count);
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000); // alle 60s
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Prüfe ob Spieler in mindestens einer Buchungsgruppe ist
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    if (isVerwalter || isMF) { setHatTrainingsgruppe(true); return; }
    const check = async () => {
      const res = await apiClient.listPlaetze();
      if (!res.success || !res.data) return;
      for (const p of res.data) {
        const gRes = await apiClient.getGruppe(p.id);
        if (gRes.success && gRes.data?.some((g: any) => g.spielerId === currentUser.id)) {
          setHatTrainingsgruppe(true);
          return;
        }
      }
    };
    check();
  }, [isAuthenticated, currentUser]);

  if (!isAuthenticated) return null;

  const rolle = currentUser?.rolle;
  const isVerwalter = rolle === 'trainings_verwalter' || rolle === 'club_manager' || rolle === 'admin';
  const isMF = currentUser?.mannschaftsfuehrer === true;

  const istGemeldet = !!currentUser?.setzlistePosition;

  // Links OHNE Benachrichtigungen (die kommen separat als Badge)
  const links = [
    { href: '/', label: 'Termine', show: hatTrainingsgruppe },
    { href: '/meden/spieltage', label: 'Meden', show: istGemeldet },
    { href: '/meden/aufstellung', label: 'Aufstellung', show: isMF || isVerwalter },
    { href: '/meden/matrix', label: 'Matrix', show: isMF || isVerwalter },
    { href: '/meden/festspiel', label: 'Festspiel', show: istGemeldet },
    { href: '/verfuegbarkeit/saisonplanung', label: 'Trainings-Planung', show: hatTrainingsgruppe },
    { href: '/profil', label: 'Profil', show: true },
    { href: '/verwaltung/plaetze', label: 'Trainings', show: isMF || isVerwalter },
    { href: '/admin/spieler', label: 'Spieler', show: isMF || isVerwalter },
  ];

  const visibleLinks = links.filter(l => l.show);

  const bellIcon = (
    <Link href="/benachrichtigungen" className="relative p-1" onClick={() => setMenuOpen(false)}>
      <span className="text-xl">🔔</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border-2 border-blue-700">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );

  return (
    <>
      {isImpersonating && (
        <div className="bg-yellow-400 text-yellow-900 text-center py-1.5 text-sm font-medium">
          👤 Du siehst die App als <span className="font-bold">{currentUser?.vorname} {currentUser?.name}</span>
          <button
            type="button"
            onClick={stopImpersonating}
            className="ml-3 bg-yellow-600 text-white px-3 py-0.5 rounded text-xs hover:bg-yellow-700"
          >
            Zurück zum Admin
          </button>
        </div>
      )}
      <nav className="bg-blue-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo links */}
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <Image
                src="/ClubLogo.jpg"
                alt="Club Logo"
                width={48}
                height={48}
                className="rounded-full object-cover"
                priority
              />
              <span className="font-bold text-lg hidden sm:inline">tc.club-app</span>
            </Link>

            {/* Desktop-Links */}
            <div className="hidden md:flex items-center gap-1">
              {visibleLinks.map(l => (
                <Link key={l.href} href={l.href}
                  className={`px-3 py-2 rounded text-sm whitespace-nowrap ${
                    pathname === l.href ? 'bg-blue-800' : 'hover:bg-blue-600'
                  }`}>
                  {l.label}
                </Link>
              ))}
              <span className="text-xs opacity-75 ml-2">
                {currentUser?.vorname}
              </span>
              {bellIcon}
              <button type="button" onClick={logout}
                className="ml-1 px-3 py-1 text-sm bg-blue-800 rounded hover:bg-blue-900">
                Logout
              </button>
            </div>

            {/* Mobil: Glocke + Hamburger */}
            <div className="flex items-center gap-2 md:hidden">
              {bellIcon}
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded hover:bg-blue-600"
                aria-label="Menü öffnen"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-blue-600 pb-3">
            <div className="px-4 pt-2 space-y-1">
              {visibleLinks.map(l => (
                <Link key={l.href} href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-3 py-2.5 rounded text-base ${
                    pathname === l.href ? 'bg-blue-800 font-medium' : 'hover:bg-blue-600'
                  }`}>
                  {l.label}
                </Link>
              ))}
              <Link href="/benachrichtigungen"
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2.5 rounded text-base ${
                  pathname === '/benachrichtigungen' ? 'bg-blue-800 font-medium' : 'hover:bg-blue-600'
                }`}>
                🔔 Benachrichtigungen {unreadCount > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 ml-1">{unreadCount}</span>}
              </Link>
              <div className="border-t border-blue-600 mt-2 pt-2 flex items-center justify-between px-3">
                <span className="text-sm opacity-75">{currentUser?.vorname}</span>
                <button type="button" onClick={() => { logout(); setMenuOpen(false); }}
                  className="px-4 py-2 text-sm bg-blue-800 rounded hover:bg-blue-900">
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
