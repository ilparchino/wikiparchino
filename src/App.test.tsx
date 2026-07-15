import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App, { AuthenticatedMedia, EventParticipantsEditor, LinkedEvents } from './App';
import { api } from './api';
import { clearAccessToken, getAccessToken, setAccessToken } from './auth';
import type { EventParticipant, MediaAsset, Person, PersonEvent } from './types';

const user = { id: 1, username: 'francesco', display_name: 'Francesco', is_admin: true };

function json(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

describe('App', () => {
  afterEach(() => {
    cleanup();
    clearAccessToken();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    window.location.hash = '';
    setAccessToken('test-session-token');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/login')) {
          return json({
            access_token: 'new-session-token',
            token_type: 'bearer',
            expires_at: '2026-07-29T10:00:00Z',
            user,
          });
        }
        if (url.endsWith('/api/auth/logout')) return Promise.resolve(new Response(null, { status: 204 }));
        if (url.endsWith('/api/me')) return json(user);
        if (url.endsWith('/api/people')) return json([]);
        if (url.endsWith('/api/places')) return json([]);
        if (url.endsWith('/api/epochs')) return json([]);
        if (url.endsWith('/api/events')) return json([]);
        if (url.includes('/api/pulls/daily')) {
          return json({ entity_type: 'event', id: 1, title: 'Elemento demo', rarity: 1, mode: 'daily' });
        }
        return json({});
      }),
    );
  });

  it('renders the authenticated dashboard', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Wiki Parchino')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Elemento demo')).toBeInTheDocument());
  });

  it('renders login without a token and stores the token after authentication', async () => {
    clearAccessToken();
    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accedi a Wiki Parchino' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'francesco' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entra' }));

    await waitFor(() => expect(screen.getByText('Elemento demo')).toBeInTheDocument());
    expect(getAccessToken()).toBe('new-session-token');
  });

  it('returns to login when session validation receives 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ detail: 'Session expired' }), { status: 401 }))),
    );

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accedi a Wiki Parchino' })).toBeInTheDocument());
    expect(getAccessToken()).toBeNull();
  });

  it('uses hash routes for direct project-page navigation', async () => {
    window.location.hash = '#/people';
    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Persone' })).toBeInTheDocument());
    expect(window.location.hash).toBe('#/people');
  });

  it('creates and revokes object URLs for authenticated media', async () => {
    const asset = {
      id: 9,
      pullable_id: 1,
      filename: 'foto.png',
      content_type: 'image/png',
      created_at: '2026-07-15T10:00:00Z',
    } as MediaAsset;
    vi.spyOn(api, 'mediaBlob').mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    const createObjectURL = vi.fn(() => 'blob:authenticated-image');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    const { unmount } = render(<AuthenticatedMedia asset={asset} />);

    await waitFor(() => expect(screen.getByRole('img', { name: 'foto.png' })).toHaveAttribute('src', 'blob:authenticated-image'));
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:authenticated-image');
  });

  it('edits free-form participant roles and sends blank roles as null', async () => {
    const people = [
      { id: 1, alias: 'Dino' },
      { id: 2, alias: 'Wat' },
    ] as Person[];
    const participants = [
      { person_id: 1, event_id: 10, role: 'Guida', motivation: null, person: people[0] },
      { person_id: 2, event_id: 10, role: null, motivation: null, person: people[1] },
    ] as EventParticipant[];
    vi.spyOn(api, 'people').mockResolvedValue(people);
    const replace = vi.spyOn(api, 'replaceEventParticipants').mockResolvedValue(participants);

    render(<EventParticipantsEditor eventId={10} initialParticipants={participants} />);
    await waitFor(() => expect(screen.getAllByLabelText('Ruolo')).toHaveLength(2));

    const roleInputs = screen.getAllByLabelText('Ruolo') as HTMLInputElement[];
    expect(roleInputs[0].tagName).toBe('INPUT');
    expect(roleInputs[0]).toHaveValue('Guida');
    expect(roleInputs[0]).toHaveAttribute('maxlength', '255');
    expect(roleInputs[1]).toHaveValue('');

    fireEvent.change(roleInputs[0], { target: { value: '  Leader  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva partecipanti' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [
        { person_id: 1, role: 'Leader', motivation: null },
        { person_id: 2, role: null, motivation: null },
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));
    expect((screen.getAllByLabelText('Ruolo') as HTMLInputElement[])[2]).toHaveValue('');
  });

  it('displays custom roles and omits badges for missing roles', () => {
    const events = [
      { person_id: 1, event_id: 10, role: 'Leader', event: { id: 10, title: 'Viaggio' } },
      { person_id: 1, event_id: 11, role: null, event: { id: 11, title: 'Cena' } },
    ] as PersonEvent[];

    const { container } = render(
      <MemoryRouter>
        <LinkedEvents events={events} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Leader')).toBeInTheDocument();
    const badges = container.querySelectorAll('.badge.text-bg-light');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('Leader');
  });
});
