import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, formatError, resolveApiBase } from './api';
import { clearAccessToken, getAccessToken, setAccessToken } from './auth';

describe('api client', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearAccessToken();
  });

  afterEach(() => {
    clearAccessToken();
    vi.unstubAllGlobals();
  });

  it('uses the browser hostname for the default local API base', () => {
    expect(resolveApiBase(undefined, { protocol: 'http:', hostname: 'localhost' })).toBe('http://localhost:8000');
    expect(resolveApiBase(undefined, { protocol: 'http:', hostname: '127.0.0.1' })).toBe('http://127.0.0.1:8000');
  });

  it('keeps an explicit API URL and removes trailing slashes', () => {
    expect(resolveApiBase(' http://api.test:9000/// ', { protocol: 'http:', hostname: 'localhost' })).toBe(
      'http://api.test:9000',
    );
  });

  it('stores login tokens in session storage and sends bearer authorization', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'opaque-session-token',
            token_type: 'bearer',
            expires_at: '2026-07-29T10:00:00Z',
            user: { id: 1, username: 'francesco', display_name: 'Francesco', is_admin: true },
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const user = await api.login('francesco', 'secret');

    expect(user.username).toBe('francesco');
    expect(getAccessToken()).toBe('opaque-session-token');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1, username: 'francesco', display_name: 'Francesco', is_admin: true })),
    );
    await api.me();

    const loginHeaders = fetchMock.mock.calls[0][1]?.headers as Headers;
    const meHeaders = fetchMock.mock.calls[1][1]?.headers as Headers;
    expect(loginHeaders.has('Authorization')).toBe(false);
    expect(meHeaders.get('Authorization')).toBe('Bearer opaque-session-token');
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('credentials');
  });

  it('clears the token after an authenticated 401 response', async () => {
    setAccessToken('expired-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ detail: 'Session expired' }), { status: 401 }))),
    );

    await expect(api.me()).rejects.toThrow('La sessione è scaduta. Accedi di nuovo per continuare.');
    expect(getAccessToken()).toBeNull();
  });

  it('sends the current token on logout and always removes it locally', async () => {
    setAccessToken('logout-token');
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.logout();

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer logout-token');
    expect(getAccessToken()).toBeNull();
  });

  it('downloads protected media with bearer authorization', async () => {
    setAccessToken('media-token');
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response('image', { headers: { 'Content-Type': 'image/png' } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const blob = await api.mediaBlob(7);

    expect(blob.type).toBe('image/png');
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer media-token');
  });

  it('deletes protected media with bearer authorization', async () => {
    setAccessToken('media-token');
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.deleteMedia(7);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/media/7'), expect.objectContaining({ method: 'DELETE' }));
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer media-token');
  });

  it.each([
    [415, 'Il formato del file non è supportato. Seleziona un’immagine valida.'],
    [422, 'Controlla i dati inseriti: alcuni valori non sono validi.'],
    [429, 'Sono stati effettuati troppi tentativi. Attendi qualche minuto e riprova.'],
    [500, 'Il server non riesce a completare la richiesta. Riprova più tardi.'],
  ])('translates HTTP %s without exposing backend details', async (status, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ detail: 'Raw backend failure' }), { status }))),
    );

    await expect(api.media(1)).rejects.toThrow(expected);
  });

  it('translates network and unexpected errors safely', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('NetworkError when attempting to fetch resource'))));

    await expect(api.media(1)).rejects.toThrow('Impossibile contattare il server. Controlla la connessione e riprova.');
    expect(formatError(new Error('Sensitive JavaScript failure'))).toBe('Si è verificato un errore inatteso. Riprova.');
    expect(formatError(new ApiError(404, 'Raw backend text', true))).toBe('L’elemento richiesto non è disponibile.');
  });

  it('sends entity updates without server-owned metadata', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 1,
            alias: 'Dino',
            sex: 'unknown',
            connotation: 'unknown',
            rarity: 1,
            created_at: '2026-07-14T10:00:00Z',
            updated_at: '2026-07-14T10:00:00Z',
            created_by: 1,
            updated_by: 1,
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.updatePerson(1, {
      alias: 'Dino',
      sex: 'unknown',
      connotation: 'unknown',
      rarity: 1,
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      alias: 'Dino',
      sex: 'unknown',
      connotation: 'unknown',
      rarity: 1,
    });
  });
});
