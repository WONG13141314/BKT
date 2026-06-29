import { apiFetch } from '../../../shared/utils/api';
import { AuthResponse, JoinCredentials } from '../types/auth.types';

export const authService = {
  joinGame: async (credentials: JoinCredentials): Promise<AuthResponse> => {
    const data = await apiFetch('/auth/join', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (data.token) localStorage.setItem('token', data.token);
    return data;
  },
  logout: () => {
    localStorage.removeItem('token');
  }
};
