import { allowedOrigin, getConfiguredOrigins } from '../origins';

describe('Cloudflare browser origins', () => {
  it('normalizes explicitly configured origins without adding development hosts', () => {
    expect(getConfiguredOrigins('https://mathopoly.example, https://school.example, https://mathopoly.example'))
      .toEqual(['https://mathopoly.example', 'https://school.example']);
  });

  it('accepts the frontend origin, including a locally hosted frontend', () => {
    for (const origin of ['https://mathopoly.example', 'http://localhost:8787', 'http://127.0.0.1:8787']) {
      expect(allowedOrigin(new Request(`${origin}/api/health`, { headers: { origin } }), {})).toBe(true);
    }
  });

  it('accepts a request without a browser origin and explicitly configured origins', () => {
    expect(allowedOrigin(new Request('https://mathopoly.example/api/health'), {})).toBe(true);
    expect(allowedOrigin(new Request('https://mathopoly.example/api/health', { headers: { origin: 'https://school.example' } }), {
      CORS_ORIGIN: ' https://school.example ',
    })).toBe(true);
  });

  it('rejects an unconfigured foreign origin', () => {
    expect(allowedOrigin(new Request('https://mathopoly.example/api/health', { headers: { origin: 'https://foreign.example' } }), {})).toBe(false);
  });
});
