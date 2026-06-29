// Toast notification hook

export function useToast() {
  // TODO: Manage toast notifications
  return {
    showToast: (_message: string, _type?: 'success' | 'error' | 'info') => {},
  };
}
