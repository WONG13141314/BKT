export const COLOR_GROUP_PRESENTATION: Record<string, string> = {
  blue: '#4a90d9',
  orange: '#f28c28',
  green: '#2e8b57',
  purple: '#8b5cf6',
  red: '#dc3f4f',
};

export function getGridPosition(index: number): { gridRow: number; gridColumn: number } {
  if (index >= 0 && index <= 5) return { gridRow: 6, gridColumn: 6 - index };
  if (index >= 6 && index <= 9) return { gridRow: 5 - (index - 6), gridColumn: 1 };
  if (index >= 10 && index <= 15) return { gridRow: 1, gridColumn: index - 9 };
  if (index >= 16 && index <= 19) return { gridRow: index - 14, gridColumn: 6 };
  return { gridRow: 1, gridColumn: 1 };
}
