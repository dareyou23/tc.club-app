'use client';

import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { TrainingRolle } from '@/lib/types';

interface Props {
  children: React.ReactNode;
  allowedRoles?: TrainingRolle[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { isAuthenticated, currentUser, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/login');
    if (!isLoading && isAuthenticated && (currentUser?.passwordChangeRequired || currentUser?.passwordResetRequired)) {
      router.push('/passwort-aendern');
    }
    if (!isLoading && isAuthenticated && allowedRoles && currentUser &&
        !allowedRoles.includes(currentUser.rolle)) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, currentUser, allowedRoles, router]);

  if (isLoading) return <div className="text-center py-12 text-gray-500">Laden...</div>;
  if (!isAuthenticated) return null;
  if (allowedRoles && currentUser && !allowedRoles.includes(currentUser.rolle)) return null;

  return <>{children}</>;
}
