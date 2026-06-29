// Layout wrapper for login and register pages
// Provides a centered, minimal layout for authentication forms

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      {children}
    </div>
  );
}
