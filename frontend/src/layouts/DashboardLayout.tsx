// Layout wrapper for dashboard and admin pages
// Includes navbar, sidebar navigation

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="dashboard-layout">
      {children}
    </div>
  );
}
