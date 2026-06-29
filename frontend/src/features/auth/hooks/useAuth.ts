// Auth hook — manages authentication state
// TODO: Implement JWT token storage, login/logout, and user state

export function useAuth() {
  // TODO: Implement
  return {
    user: null,
    isAuthenticated: false,
    login: async (_email: string, _password: string) => {},
    register: async (_name: string, _email: string, _password: string) => {},
    logout: () => {},
  };
}
