// Auth feature — Protected route wrapper
// Redirects unauthenticated users to login page
// TODO: Implement with react-router-dom Navigate

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'STUDENT' | 'ADMIN';
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  // TODO: Check auth state and redirect if not authenticated
  return <>{children}</>;
}
