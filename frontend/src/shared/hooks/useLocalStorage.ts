// Hook for persisting state in localStorage

export function useLocalStorage<T>(key: string, initialValue: T) {
  // TODO: Implement localStorage-backed state
  return [initialValue, (_value: T) => {}] as const;
}
