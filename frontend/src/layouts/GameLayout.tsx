// Layout wrapper for the in-game view
// Full-screen layout without traditional navigation

interface GameLayoutProps {
  children: React.ReactNode;
}

export function GameLayout({ children }: GameLayoutProps) {
  return (
    <div className="game-layout">
      {children}
    </div>
  );
}
