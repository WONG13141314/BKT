import { getAllowedOrigins } from './origins';

describe('getAllowedOrigins', () => {
  it('accepts both common local browser hosts outside production', () => {
    expect(getAllowedOrigins('http://localhost:5173', 'development')).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('accepts only explicitly configured origins in production', () => {
    expect(getAllowedOrigins('https://mathopoly.example, https://school.example', 'production'))
      .toEqual(['https://mathopoly.example', 'https://school.example']);
  });
});
