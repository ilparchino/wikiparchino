import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App, { AuthenticatedMedia, DetailShell, EventParticipantsEditor, LinkedEvents, MediaSection } from './App';
import { api } from './api';
import { clearAccessToken, getAccessToken, setAccessToken } from './auth';
import { COLOR_MODE_STORAGE_KEY } from './theme';
import type {
  AdminUserDetail,
  Epoch,
  Event,
  EventParticipant,
  Group,
  GroupSummary,
  MaintenanceStatus,
  MediaAsset,
  Person,
  PersonEvent,
  Place,
} from './types';

const user = {
  id: 1,
  username: 'francesco',
  display_name: 'Francesco',
  is_admin: true,
  is_owner: true,
};
const availableMaintenance: MaintenanceStatus = {
  state: 'available',
  server_time: '2026-07-29T10:00:00Z',
  announced_at: null,
  starts_at: null,
  message: null,
  login_allowed: true,
  api_available: true,
};

function installColorScheme(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    get matches() { return matches; },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  return {
    change(value: boolean) {
      matches = value;
      listeners.forEach((listener) => listener({ matches: value } as MediaQueryListEvent));
    },
  };
}

function json(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

describe('App', () => {
  let colorScheme: ReturnType<typeof installColorScheme>;

  afterEach(() => {
    cleanup();
    clearAccessToken();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-bs-theme');
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', '#1f7a4d');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    if (!document.querySelector('meta[name="theme-color"]')) {
      const themeColor = document.createElement('meta');
      themeColor.name = 'theme-color';
      themeColor.content = '#1f7a4d';
      document.head.appendChild(themeColor);
    }
    colorScheme = installColorScheme(false);
    window.location.hash = '';
    setAccessToken('test-session-token');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/maintenance/status')) return json(availableMaintenance);
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
        if (url.endsWith('/api/groups')) return json([]);
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
    const accountMenu = screen.getByRole('button', { name: 'Francesco' });
    expect(accountMenu).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(accountMenu);
    expect(accountMenu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Profilo' })).toHaveAttribute('href', '#/profile');
    expect(screen.getByRole('link', { name: 'Amministrazione' })).toHaveAttribute('href', '#/admin');
    const themeToggle = screen.getByRole('button', { name: 'Attiva tema scuro' });
    expect(screen.getByRole('button', { name: 'Esci' })).toBeInTheDocument();
    fireEvent.click(themeToggle);
    expect(document.documentElement).toHaveAttribute('data-bs-theme', 'dark');
    expect(accountMenu).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides administration and blocks its route for regular users', async () => {
    const regular = { ...user, is_admin: false, is_owner: false };
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/maintenance/status')) return json(availableMaintenance);
      if (String(input).endsWith('/api/me')) return json(regular);
      return json({});
    }));
    window.location.hash = '#/admin';

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accesso negato' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Francesco' }));
    expect(screen.queryByRole('link', { name: 'Amministrazione' })).not.toBeInTheDocument();
  });

  it('closes the account menu with Escape and an outside click', async () => {
    render(<App />);
    const accountMenu = await screen.findByRole('button', { name: 'Francesco' });
    fireEvent.click(accountMenu);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(accountMenu).toHaveAttribute('aria-expanded', 'false');
    expect(accountMenu).toHaveFocus();
    fireEvent.click(accountMenu);
    fireEvent.mouseDown(document.body);
    expect(accountMenu).toHaveAttribute('aria-expanded', 'false');
  });

  it('logs out from the account dropdown', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Francesco' }));
    fireEvent.click(screen.getByRole('button', { name: 'Esci' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accedi a Wiki Parchino' })).toBeInTheDocument());
    expect(getAccessToken()).toBeNull();
  });

  it('renders administrator metrics, users, and recent activity', async () => {
    vi.spyOn(api, 'adminSummary').mockResolvedValue({
      total_users: 2, active_users: 1, inactive_users: 1, admin_users: 1,
      active_sessions: 3, people: 3, places: 2, epochs: 1, events: 1, groups: 2, media: 4,
      activity_last_24h: 6,
    });
    vi.spyOn(api, 'adminUsers').mockResolvedValue([{
      ...user, is_active: true, created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-01T10:00:00Z', active_session_count: 2,
    }]);
    vi.spyOn(api, 'adminActivity').mockResolvedValue({
      items: [{
        source: 'authentication', action: 'login_succeeded', occurred_at: '2026-07-18T10:00:00Z',
        actor: user, target: user, entity_type: null, entity_id: null, title: 'Francesco',
        linkable: false, source_ip: '127.0.0.1',
      }], total: 1, page: 1, page_size: 10,
    });
    window.location.hash = '#/admin';

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Amministrazione' })).toBeInTheDocument());
    expect(screen.getByText('Utenti attivi')).toBeInTheDocument();
    expect(screen.getByText('@francesco')).toBeInTheDocument();
    expect(screen.getByText('Proprietario')).toHaveClass('text-bg-warning');
    expect(screen.getByText(/Accesso riuscito/)).toBeInTheDocument();
  });

  it('renders the Owner as read-only for another administrator', async () => {
    const otherAdmin = {
      id: 2,
      username: 'admin2',
      display_name: 'Altro Admin',
      is_admin: true,
      is_owner: false,
    };
    const ownerAccount = {
      ...user,
      id: 1,
      username: 'owner',
      display_name: 'Proprietario Sistema',
      is_active: true,
      created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-01T10:00:00Z',
      active_session_count: 2,
    };
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/maintenance/status')) return json(availableMaintenance);
      if (url.endsWith('/api/me')) return json(otherAdmin);
      return json({});
    }));
    vi.spyOn(api, 'adminUser').mockResolvedValue({
      user: ownerAccount,
      content_activity: [],
      account_activity: [],
    });
    const update = vi.spyOn(api, 'updateAdminUser');
    const reset = vi.spyOn(api, 'resetAdminUserPassword');
    const revoke = vi.spyOn(api, 'revokeAdminUserSessions');
    window.location.hash = '#/admin/users/1';

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Proprietario Sistema' })).toBeInTheDocument());
    expect(screen.getByText('Proprietario', { selector: '.badge' })).toHaveClass('text-bg-warning');
    expect(screen.getByRole('note')).toHaveTextContent('Soltanto il Proprietario');
    expect(screen.getByLabelText('Nome visualizzato')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Amministratore' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disattiva' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Revoca sessioni' })).toBeDisabled();
    expect(screen.getByText(/password del Proprietario non può essere reimpostata/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Nuova password/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Proprietario' })).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('creates users only after matching password confirmation', async () => {
    const createdUser = {
      id: 9, username: 'nuovo', display_name: 'Nuovo Utente', is_admin: false, is_owner: false,
      is_active: true, created_at: '2026-07-18T10:00:00Z', updated_at: '2026-07-18T10:00:00Z',
      active_session_count: 0,
    };
    const createUser = vi.spyOn(api, 'createAdminUser').mockResolvedValue(createdUser);
    vi.spyOn(api, 'adminUser').mockResolvedValue({
      user: createdUser,
      content_activity: [],
      account_activity: [],
    });
    window.location.hash = '#/admin/users/new';
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nuovo utente' })).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: 'Mostra password' })).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Username *'), { target: { value: 'nuovo' } });
    fireEvent.change(screen.getByLabelText('Nome visualizzato *'), { target: { value: 'Nuovo Utente' } });
    expect(screen.getByText(/Da 12 a 200 caratteri stampabili/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password nuova café ☕' } });
    fireEvent.change(screen.getByLabelText('Conferma password *'), { target: { value: 'password-diversa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crea utente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('conferma');
    expect(createUser).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Conferma password *'), { target: { value: 'password nuova café ☕' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crea utente' }));
    await waitFor(() => expect(createUser).toHaveBeenCalledWith({
      username: 'nuovo', display_name: 'Nuovo Utente', password: 'password nuova café ☕', is_admin: false,
    }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nuovo Utente' })).toBeInTheDocument());
  });

  it('confirms deactivation and sends the preserved account fields', async () => {
    const managed = {
      id: 8, username: 'gestito', display_name: 'Utente Gestito', is_admin: false, is_owner: false,
      is_active: true, created_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:00:00Z',
      active_session_count: 1,
    };
    vi.spyOn(api, 'adminUser').mockResolvedValue({ user: managed, content_activity: [], account_activity: [] });
    const update = vi.spyOn(api, 'updateAdminUser').mockResolvedValue({ ...managed, is_active: false });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    window.location.hash = '#/admin/users/8';
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Utente Gestito' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Disattiva' }));
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Disattiva' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(8, {
      display_name: 'Utente Gestito', is_admin: false, is_active: false,
    }));
  });

  it('resets a managed user password and revokes their sessions', async () => {
    const managed = {
      id: 8, username: 'gestito', display_name: 'Utente Gestito', is_admin: false, is_owner: false,
      is_active: true, created_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:00:00Z',
      active_session_count: 2,
    };
    const refreshed = { ...managed, active_session_count: 0 };
    let completeRefresh: ((value: AdminUserDetail) => void) | undefined;
    const adminUser = vi.spyOn(api, 'adminUser')
      .mockResolvedValueOnce({ user: managed, content_activity: [], account_activity: [] })
      .mockImplementationOnce(
        () => new Promise<AdminUserDetail>((resolve) => { completeRefresh = resolve; }),
      );
    let completeReset: (() => void) | undefined;
    const resetPassword = vi.spyOn(api, 'resetAdminUserPassword').mockImplementation(
      () => new Promise<void>((resolve) => { completeReset = resolve; }),
    );
    window.location.hash = '#/admin/users/8';

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Utente Gestito' })).toBeInTheDocument());
    expect(screen.queryByLabelText(/Password attuale/)).not.toBeInTheDocument();
    expect(screen.getByText(/Da 12 a 200 caratteri stampabili/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mostra password' })).toHaveLength(2);

    const newPassword = screen.getByLabelText(/^Nuova password/);
    const confirmation = screen.getByLabelText(/^Conferma nuova password/);
    fireEvent.change(newPassword, { target: { value: ' password nuova café ☕' } });
    fireEvent.change(confirmation, { target: { value: ' password nuova café ☕' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna password' }));
    expect(await screen.findByText(/non può iniziare o terminare/)).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
    expect(newPassword).toHaveValue(' password nuova café ☕');
    expect(confirmation).toHaveValue(' password nuova café ☕');

    fireEvent.change(newPassword, { target: { value: 'password nuova café ☕' } });
    fireEvent.change(confirmation, { target: { value: 'password nuova café ☕' } });
    const revealNewPassword = newPassword.closest('.input-group')?.querySelector<HTMLButtonElement>(
      '.password-visibility-toggle',
    );
    expect(revealNewPassword).toBeDefined();
    fireEvent.click(revealNewPassword!);
    expect(newPassword).toHaveAttribute('type', 'text');
    const submitPassword = screen.getByRole('button', { name: 'Aggiorna password' });
    fireEvent.click(submitPassword);
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith(8, 'password nuova café ☕'));
    expect(submitPassword).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    completeReset?.();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tutte le sessioni dell’utente sono state revocate',
    );
    await waitFor(() => expect(adminUser).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'Utente Gestito' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Password aggiornata');
    expect(newPassword).toHaveValue('');
    expect(confirmation).toHaveValue('');
    expect(newPassword).toHaveAttribute('type', 'password');
    expect(confirmation).toHaveAttribute('type', 'password');

    completeRefresh?.({
      user: refreshed,
      content_activity: [],
      account_activity: [],
    });
    const sessions = screen.getByRole('heading', { name: 'Sessioni' }).closest('section');
    expect(sessions).not.toBeNull();
    await waitFor(() => expect(within(sessions!).getByText('0')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Password aggiornata');
    expect(screen.getByRole('button', { name: 'Revoca sessioni' })).toBeDisabled();
  });

  it('preserves admin password feedback and content when the detail refresh fails', async () => {
    const managed = {
      id: 8, username: 'gestito', display_name: 'Utente Gestito', is_admin: false, is_owner: false,
      is_active: true, created_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:00:00Z',
      active_session_count: 1,
    };
    vi.spyOn(api, 'adminUser')
      .mockResolvedValueOnce({ user: managed, content_activity: [], account_activity: [] })
      .mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(api, 'resetAdminUserPassword').mockResolvedValue(undefined);
    window.location.hash = '#/admin/users/8';

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Utente Gestito' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^Nuova password/), { target: { value: 'password-nuova-sicura' } });
    fireEvent.change(screen.getByLabelText(/^Conferma nuova password/), { target: { value: 'password-nuova-sicura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna password' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Password aggiornata');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non è stato possibile caricare i dati amministrativi',
    );
    expect(screen.getByRole('heading', { name: 'Utente Gestito' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Password aggiornata');
  });

  it('renders login without a token and stores the token after authentication', async () => {
    clearAccessToken();
    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accedi a Wiki Parchino' })).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: 'Mostra password' })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'francesco' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'password' } });
    const themeToggle = screen.getByRole('button', { name: 'Attiva tema scuro' });
    expect(themeToggle).toHaveClass('login-theme-toggle');
    fireEvent.click(themeToggle);
    expect(document.documentElement).toHaveAttribute('data-bs-theme', 'dark');
    expect(window.localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('dark');
    expect(screen.getByLabelText(/Username/)).toHaveValue('francesco');
    expect(screen.getByLabelText(/Password/)).toHaveValue('password');
    fireEvent.click(screen.getByRole('button', { name: 'Entra' }));

    await waitFor(() => expect(screen.getByText('Elemento demo')).toBeInTheDocument());
    expect(getAccessToken()).toBe('new-session-token');
  });

  it('warns authenticated users during the maintenance countdown', async () => {
    const startsAt = new Date(Date.now() + 15 * 60_000).toISOString();
    vi.spyOn(api, 'maintenanceStatus').mockResolvedValue({
      state: 'scheduled',
      server_time: new Date().toISOString(),
      announced_at: new Date().toISOString(),
      starts_at: startsAt,
      message: 'Aggiornamento programmato',
      login_allowed: false,
      api_available: true,
    });

    render(<App />);

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('Manutenzione programmata');
    expect(warning).toHaveTextContent('Aggiornamento programmato');
    expect(warning).toHaveTextContent(/14 min|15 min/);
    expect(await screen.findByText('Elemento demo')).toBeInTheDocument();
    expect(getAccessToken()).toBe('test-session-token');
  });

  it('disables login as soon as maintenance is scheduled', async () => {
    clearAccessToken();
    vi.spyOn(api, 'maintenanceStatus').mockResolvedValue({
      state: 'scheduled',
      server_time: new Date().toISOString(),
      announced_at: new Date().toISOString(),
      starts_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      message: null,
      login_allowed: false,
      api_available: true,
    });

    render(<App />);

    expect(await screen.findByLabelText(/Username/)).toBeDisabled();
    expect(screen.getByLabelText(/Password/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Entra' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Non è possibile avviare nuove sessioni');
    expect(screen.getByRole('alert')).toHaveClass('mb-3');
  });

  it('clears the session and replaces the app when maintenance is active', async () => {
    vi.spyOn(api, 'maintenanceStatus').mockResolvedValue({
      state: 'active',
      server_time: new Date().toISOString(),
      announced_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      message: 'Intervento sul database',
      login_allowed: false,
      api_available: false,
    });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Wiki Parchino è in manutenzione' })).toBeInTheDocument();
    expect(screen.getByText('Intervento sul database')).toBeInTheDocument();
    await waitFor(() => expect(getAccessToken()).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Accedi a Wiki Parchino' })).not.toBeInTheDocument();
  });

  it('does not expose login when the initial server status is unavailable', async () => {
    clearAccessToken();
    vi.spyOn(api, 'maintenanceStatus').mockRejectedValue(new TypeError('offline'));

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Server non disponibile' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Accedi a Wiki Parchino' })).not.toBeInTheDocument();
  });

  it('follows the system theme until the user stores an explicit preference', async () => {
    clearAccessToken();
    colorScheme.change(true);
    const view = render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accedi a Wiki Parchino' })).toBeInTheDocument());
    expect(document.documentElement).toHaveAttribute('data-bs-theme', 'dark');
    expect(window.localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBeNull();
    colorScheme.change(false);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-bs-theme', 'light'));

    fireEvent.click(screen.getByRole('button', { name: 'Attiva tema scuro' }));
    expect(document.documentElement).toHaveAttribute('data-bs-theme', 'dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#15191d');
    colorScheme.change(false);
    expect(document.documentElement).toHaveAttribute('data-bs-theme', 'dark');

    view.unmount();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Attiva tema chiaro' })).toBeInTheDocument());
    expect(document.documentElement).toHaveAttribute('data-bs-theme', 'dark');
  });

  it('returns to login when session validation receives 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => (
        String(input).endsWith('/api/maintenance/status')
          ? json(availableMaintenance)
          : Promise.resolve(new Response(JSON.stringify({ detail: 'Session expired' }), { status: 401 }))
      )),
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

  it('renders the profile activity and changes the password without ending the session', async () => {
    vi.spyOn(api, 'profile').mockResolvedValue({
      user,
      recent_activity: [
        {
          entity_type: 'event',
          entity_id: 7,
          title: 'Viaggio memorabile',
          action: 'updated',
          occurred_at: '2026-07-17T10:00:00Z',
        },
      ],
    });
    const changePassword = vi.spyOn(api, 'changePassword').mockResolvedValue(undefined);
    window.location.hash = '#/profile';

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Profilo' })).toBeInTheDocument());
    expect(screen.getByText('@francesco')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Viaggio memorabile/ })).toHaveAttribute('href', '#/events/7');
    expect(screen.getByText(/Da 12 a 200 caratteri stampabili/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mostra password' })).toHaveLength(3);
    fireEvent.change(screen.getByLabelText(/Password attuale/), { target: { value: 'password-attuale' } });
    fireEvent.change(screen.getByLabelText(/^Nuova password/), { target: { value: 'password-nuova-sicura' } });
    fireEvent.change(screen.getByLabelText(/Conferma nuova password/), { target: { value: 'password-nuova-sicura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna password' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('password-attuale', 'password-nuova-sicura'));
    expect(screen.getByRole('status')).toHaveTextContent('Password aggiornata');
    expect(getAccessToken()).toBe('test-session-token');
  });

  it('renders fixed authenticated previews on every entity list', async () => {
    const metadata = {
      rarity: 1,
      created_at: '2026-07-17T09:00:00Z',
      updated_at: '2026-07-17T09:00:00Z',
      created_by: 1,
      updated_by: 1,
    };
    vi.spyOn(api, 'people').mockResolvedValue([
      {
        id: 1,
        alias: 'Dino',
        name: 'Nome',
        surname: 'Cognome',
        sex: 'male',
        connotation: 'positive',
        description: 'Descrizione della persona',
        ...metadata,
      } as Person,
    ]);
    vi.spyOn(api, 'places').mockResolvedValue([
      { id: 2, name: 'Parchino', address: 'Via Dimostrativa #2', description: null, ...metadata },
    ]);
    vi.spyOn(api, 'epochs').mockResolvedValue([
      {
        id: 3,
        name: 'Post-Covid',
        description: 'Descrizione dell epoca',
        start_year: 2020,
        end_year: 2025,
        end_month: 7,
        ...metadata,
      },
    ]);
    vi.spyOn(api, 'events').mockResolvedValue([
      {
        id: 4,
        title: 'APPoti APPiedi',
        description: 'Descrizione dell evento',
        place_id: 2,
        epoch_id: 3,
        year: 2025,
        month: 7,
        day: null,
        place: { id: 2, name: 'Parchino', address: 'Via Dimostrativa #2', description: null, ...metadata },
        epoch: { id: 3, name: 'Post-Covid', description: null, ...metadata },
        ...metadata,
      } as Event,
    ]);
    vi.spyOn(api, 'groups').mockResolvedValue([
      {
        id: 5,
        name: 'Cerchia Demo',
        description: 'Descrizione della cerchia',
        people_count: 1,
        epoch_count: 2,
        ...metadata,
      } as GroupSummary,
    ]);
    vi.spyOn(api, 'mediaPreviews').mockImplementation(async (ids) =>
      ids.map((id) => ({
        id: id + 20,
        pullable_id: id,
        filename: 'non-visibile.png',
        content_type: 'image/png',
        created_at: `2026-07-17T10:00:0${id}Z`,
      })),
    );
    vi.spyOn(api, 'mediaBlob').mockResolvedValue(new Blob(['preview'], { type: 'image/png' }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:entity-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const listCases: Array<{
      route: string;
      label: string;
      subtitle: string | null;
      description: string;
    }> = [
      { route: '#/people', label: 'Dino', subtitle: 'Nome Cognome', description: 'Descrizione della persona' },
      { route: '#/places', label: 'Parchino', subtitle: 'Via Dimostrativa #2', description: 'Nessuna descrizione' },
      {
        route: '#/epochs',
        label: 'Post-Covid',
        subtitle: 'Dal 2020 al luglio 2025',
        description: 'Descrizione dell epoca',
      },
      {
        route: '#/events',
        label: 'APPoti APPiedi',
        subtitle: 'Parchino · Post-Covid · luglio 2025',
        description: 'Descrizione dell evento',
      },
      {
        route: '#/groups',
        label: 'Cerchia Demo',
        subtitle: '1 persona · 2 epoche',
        description: 'Descrizione della cerchia',
      },
    ];

    for (const { route, label, subtitle, description } of listCases) {
      window.location.hash = route;
      render(<App />);
      const image = await screen.findByRole('img', { name: `Anteprima di ${label}` });
      const preview = image.closest('.entity-preview');
      const card = image.closest('.entity-card') as HTMLElement;
      expect(preview).toBeInTheDocument();
      expect(preview?.querySelector('.entity-preview-backdrop')).toHaveAttribute('aria-hidden', 'true');
      expect(preview?.querySelector('.entity-preview-image')).toBe(image);
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('entity-card');
      expect(within(card).getByText(description)).toHaveClass('entity-card-description');
      if (subtitle) {
        expect(within(card).getByText(subtitle)).toHaveClass('entity-card-subtitle');
      } else {
        expect(card.querySelector('.entity-card-subtitle')).not.toBeInTheDocument();
      }
      expect(screen.queryByText('non-visibile.png')).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('filters places by address and omits the subtitle when an address is absent', async () => {
    const metadata = {
      rarity: 1,
      created_at: '2026-07-17T09:00:00Z',
      updated_at: '2026-07-17T09:00:00Z',
      created_by: 1,
      updated_by: 1,
    };
    vi.spyOn(api, 'places').mockResolvedValue([
      {
        id: 1,
        name: 'Luogo con indirizzo',
        address: 'Via Dimostrativa 10, Torino',
        description: 'Primo luogo',
        ...metadata,
      },
      {
        id: 2,
        name: 'Luogo senza indirizzo',
        address: null,
        description: 'Secondo luogo',
        ...metadata,
      },
    ]);
    vi.spyOn(api, 'mediaPreviews').mockResolvedValue([]);
    window.location.hash = '#/places';

    render(<App />);

    const addressedCard = (await screen.findByText('Luogo con indirizzo')).closest('.entity-card') as HTMLElement;
    expect(within(addressedCard).getByText('Via Dimostrativa 10, Torino')).toHaveClass('entity-card-subtitle');
    const unaddressedCard = screen.getByText('Luogo senza indirizzo').closest('.entity-card') as HTMLElement;
    expect(unaddressedCard.querySelector('.entity-card-subtitle')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Filtra per nome, indirizzo o descrizione'), {
      target: { value: 'torino' },
    });
    expect(screen.getByText('Luogo con indirizzo')).toBeInTheDocument();
    expect(screen.queryByText('Luogo senza indirizzo')).not.toBeInTheDocument();
  });

  it('submits a blank optional address as null from the place form', async () => {
    const savedPlace = {
      id: 50,
      name: 'Luogo nuovo',
      address: null,
      description: null,
      rarity: 1,
      created_at: '2026-07-17T09:00:00Z',
      updated_at: '2026-07-17T09:00:00Z',
      created_by: 1,
      updated_by: 1,
    } as Place;
    const createPlace = vi.spyOn(api, 'createPlace').mockResolvedValue(savedPlace);
    vi.spyOn(api, 'place').mockResolvedValue(savedPlace);
    vi.spyOn(api, 'placePeople').mockResolvedValue([]);
    vi.spyOn(api, 'placeEvents').mockResolvedValue([]);
    vi.spyOn(api, 'media').mockResolvedValue([]);
    window.location.hash = '#/places/new';

    render(<App />);

    await screen.findByRole('heading', { name: 'Nuovo luogo' });
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Luogo nuovo' } });
    const address = screen.getByLabelText('Indirizzo');
    expect(address).toHaveAttribute('maxlength', '500');
    fireEvent.change(address, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    await waitFor(() => expect(createPlace).toHaveBeenCalledWith({
      name: 'Luogo nuovo',
      address: null,
      description: null,
      rarity: 1,
    }));
  });

  it('shows the address or its empty value on place details', async () => {
    const place = {
      id: 51,
      name: 'Luogo dettagliato',
      address: null,
      description: null,
      rarity: 1,
      created_at: '2026-07-17T09:00:00Z',
      updated_at: '2026-07-17T09:00:00Z',
      created_by: 1,
      updated_by: 1,
    } as Place;
    vi.spyOn(api, 'place').mockResolvedValue(place);
    vi.spyOn(api, 'placePeople').mockResolvedValue([]);
    vi.spyOn(api, 'placeEvents').mockResolvedValue([]);
    vi.spyOn(api, 'media').mockResolvedValue([]);
    window.location.hash = '#/places/51';

    render(<App />);

    await screen.findByRole('heading', { name: 'Luogo dettagliato' });
    expect(screen.getByText('Indirizzo')).toBeInTheDocument();
    expect(screen.getByText('Non indicato')).toBeInTheDocument();
  });

  it('creates a cerchia with the shared entity form behavior', async () => {
    const savedGroup = {
      id: 60,
      name: 'Cerchia nuova',
      description: null,
      rarity: 1.5,
      created_at: '2026-07-31T10:00:00Z',
      updated_at: '2026-07-31T10:00:00Z',
      created_by: 1,
      updated_by: 1,
    } as Group;
    const createGroup = vi.spyOn(api, 'createGroup').mockResolvedValue(savedGroup);
    vi.spyOn(api, 'group').mockResolvedValue(savedGroup);
    vi.spyOn(api, 'groupPeople').mockResolvedValue([]);
    vi.spyOn(api, 'groupEpochs').mockResolvedValue([]);
    vi.spyOn(api, 'media').mockResolvedValue([]);
    window.location.hash = '#/groups/new';

    render(<App />);

    await screen.findByRole('heading', { name: 'Nuova cerchia' });
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Cerchia nuova' } });
    fireEvent.change(screen.getByLabelText(/Rarità/), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('Descrizione'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    await waitFor(() => expect(createGroup).toHaveBeenCalledWith({
      name: 'Cerchia nuova',
      description: null,
      rarity: 1.5,
    }));
  });

  it('edits cerchia people and epochs independently and blocks duplicates', async () => {
    const metadata = {
      rarity: 1,
      created_at: '2026-07-31T10:00:00Z',
      updated_at: '2026-07-31T10:00:00Z',
      created_by: 1,
      updated_by: 1,
    };
    const group = {
      id: 61,
      name: 'Cerchia collegata',
      description: 'Descrizione',
      ...metadata,
    } as Group;
    const people = [
      { id: 1, alias: 'Persona Uno', sex: 'unknown', connotation: 'unknown', ...metadata },
      { id: 2, alias: 'Persona Due', sex: 'unknown', connotation: 'unknown', ...metadata },
    ] as Person[];
    const epochs = [
      { id: 3, name: 'Epoca Uno', ...metadata },
      { id: 4, name: 'Epoca Due', ...metadata },
    ] as Epoch[];
    vi.spyOn(api, 'group').mockResolvedValue(group);
    vi.spyOn(api, 'groupPeople').mockResolvedValue([people[0]]);
    vi.spyOn(api, 'groupEpochs').mockResolvedValue([epochs[0]]);
    vi.spyOn(api, 'people').mockResolvedValue(people);
    vi.spyOn(api, 'epochs').mockResolvedValue(epochs);
    vi.spyOn(api, 'media').mockResolvedValue([]);
    const replacePeople = vi.spyOn(api, 'replaceGroupPeople').mockResolvedValue(people);
    const replaceEpochs = vi.spyOn(api, 'replaceGroupEpochs').mockResolvedValue(epochs);
    window.location.hash = '#/groups/61';

    render(<App />);

    await screen.findByRole('heading', { name: 'Cerchia collegata' });
    const peopleSection = screen.getByRole('heading', { name: 'Persone della cerchia' }).closest('section') as HTMLElement;
    fireEvent.click(within(peopleSection).getByRole('button', { name: 'Aggiungi' }));
    const peopleSelects = within(peopleSection).getAllByLabelText('Persona');
    fireEvent.change(peopleSelects[1], { target: { value: '2' } });
    fireEvent.click(within(peopleSection).getByRole('button', { name: 'Salva persone' }));
    await waitFor(() => expect(replacePeople).toHaveBeenCalledWith(61, [1, 2]));
    expect(within(peopleSection).getByText('Persone della cerchia salvate.')).toBeInTheDocument();

    fireEvent.click(within(peopleSection).getByRole('button', { name: 'Aggiungi' }));
    const duplicateSelects = within(peopleSection).getAllByLabelText('Persona');
    fireEvent.change(duplicateSelects[2], { target: { value: '1' } });
    fireEvent.click(within(peopleSection).getByRole('button', { name: 'Salva persone' }));
    expect(within(peopleSection).getByRole('alert')).toHaveTextContent('una sola volta');
    expect(replacePeople).toHaveBeenCalledTimes(1);

    const epochSection = screen.getByRole('heading', { name: 'Epoche della cerchia' }).closest('section') as HTMLElement;
    fireEvent.click(within(epochSection).getByRole('button', { name: 'Aggiungi' }));
    const epochSelects = within(epochSection).getAllByLabelText('Epoca');
    fireEvent.change(epochSelects[1], { target: { value: '4' } });
    fireEvent.click(within(epochSection).getByRole('button', { name: 'Salva epoche' }));
    await waitFor(() => expect(replaceEpochs).toHaveBeenCalledWith(61, [3, 4]));
    expect(within(epochSection).getByText('Epoche della cerchia salvate.')).toBeInTheDocument();
  });

  it('shows reciprocal cerchia links on person and epoch details', async () => {
    const metadata = {
      rarity: 1,
      created_at: '2026-07-31T10:00:00Z',
      updated_at: '2026-07-31T10:00:00Z',
      created_by: 1,
      updated_by: 1,
    };
    const group = { id: 70, name: 'Cerchia reciproca', description: null, ...metadata } as Group;
    const person = {
      id: 71,
      alias: 'Persona reciproca',
      sex: 'unknown',
      connotation: 'unknown',
      ...metadata,
    } as Person;
    const epoch = { id: 72, name: 'Epoca reciproca', ...metadata } as Epoch;
    vi.spyOn(api, 'person').mockResolvedValue(person);
    vi.spyOn(api, 'personPlaces').mockResolvedValue([]);
    vi.spyOn(api, 'personEvents').mockResolvedValue([]);
    vi.spyOn(api, 'personGroups').mockResolvedValue([group]);
    vi.spyOn(api, 'media').mockResolvedValue([]);
    window.location.hash = '#/people/71';

    render(<App />);
    await screen.findByRole('heading', { name: 'Persona reciproca' });
    expect(screen.getByRole('link', { name: 'Cerchia reciproca' })).toHaveAttribute('href', '#/groups/70');

    cleanup();
    vi.spyOn(api, 'epoch').mockResolvedValue(epoch);
    vi.spyOn(api, 'epochEvents').mockResolvedValue([]);
    vi.spyOn(api, 'epochGroups').mockResolvedValue([group]);
    window.location.hash = '#/epochs/72';

    render(<App />);
    await screen.findByRole('heading', { name: 'Epoca reciproca' });
    expect(screen.getByRole('link', { name: 'Cerchia reciproca' })).toHaveAttribute('href', '#/groups/70');
  });

  it('uses the requested connotation colors only on person cards', async () => {
    const metadata = {
      rarity: 1,
      created_at: '2026-07-17T09:00:00Z',
      updated_at: '2026-07-17T09:00:00Z',
      created_by: 1,
      updated_by: 1,
    };
    vi.spyOn(api, 'people').mockResolvedValue([
      { id: 1, alias: 'Positiva', sex: 'female', connotation: 'positive', ...metadata },
      { id: 2, alias: 'Negativa', sex: 'male', connotation: 'negative', ...metadata },
      { id: 3, alias: 'Neutra', sex: 'other', connotation: 'neutral', ...metadata },
      { id: 4, alias: 'Sconosciuta', sex: 'unknown', connotation: 'unknown', ...metadata },
    ] as Person[]);
    vi.spyOn(api, 'mediaPreviews').mockResolvedValue([]);
    window.location.hash = '#/people';

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Persone' })).toBeInTheDocument());
    expect(screen.getByText('Positiva', { selector: '.badge' })).toHaveClass('text-bg-success');
    expect(screen.getByText('Negativa', { selector: '.badge' })).toHaveClass('text-bg-danger');
    expect(screen.getByText('Neutra', { selector: '.badge' })).toHaveClass('text-bg-light');
    expect(screen.getByText('Sconosciuta', { selector: '.badge' })).toHaveClass('text-bg-secondary');
    expect(screen.queryByText('Persona', { selector: '.badge' })).not.toBeInTheDocument();
  });

  it('formats every supported event partial date in Italian', async () => {
    const metadata = {
      rarity: 1,
      created_at: '2026-07-17T09:00:00Z',
      updated_at: '2026-07-17T09:00:00Z',
      created_by: 1,
      updated_by: 1,
    };
    const place = { id: 20, name: 'Luogo', ...metadata };
    const epoch = { id: 21, name: 'Epoca', ...metadata };
    const baseEvent = {
      place_id: place.id,
      epoch_id: epoch.id,
      place,
      epoch,
      description: null,
      ...metadata,
    };
    vi.spyOn(api, 'events').mockResolvedValue([
      { ...baseEvent, id: 1, title: 'Solo anno', year: 2025, month: null, day: null },
      { ...baseEvent, id: 2, title: 'Anno e mese', year: 2025, month: 7, day: null },
      { ...baseEvent, id: 3, title: 'Data completa', year: 2025, month: 7, day: 14 },
      { ...baseEvent, id: 4, title: 'Data ignota', year: null, month: null, day: null },
    ] as Event[]);
    vi.spyOn(api, 'mediaPreviews').mockResolvedValue([]);
    window.location.hash = '#/events';

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Eventi' })).toBeInTheDocument());
    expect(screen.getByText('Luogo · Epoca · 2025')).toBeInTheDocument();
    expect(screen.getByText('Luogo · Epoca · luglio 2025')).toBeInTheDocument();
    expect(screen.getByText('Luogo · Epoca · 14 luglio 2025')).toBeInTheDocument();
    expect(screen.getByText('Luogo · Epoca · Data sconosciuta')).toBeInTheDocument();
  });

  it('blocks an epoch edit that would exclude a linked event', async () => {
    const metadata = {
      rarity: 1,
      created_at: '2026-07-17T09:00:00Z',
      updated_at: '2026-07-17T09:00:00Z',
      created_by: 1,
      updated_by: 1,
    };
    const epoch = {
      id: 30,
      name: 'Epoca delimitata',
      description: null,
      start_year: 2020,
      start_month: null,
      start_day: null,
      end_year: 2030,
      end_month: null,
      end_day: null,
      ...metadata,
    } as Epoch;
    const linkedEvent = {
      id: 31,
      title: 'Evento collegato',
      description: null,
      place_id: 2,
      epoch_id: epoch.id,
      year: 2025,
      month: 6,
      day: null,
      epoch,
      ...metadata,
    } as Event;
    vi.spyOn(api, 'epoch').mockResolvedValue(epoch);
    vi.spyOn(api, 'epochEvents').mockResolvedValue([linkedEvent]);
    const updateEpoch = vi.spyOn(api, 'updateEpoch').mockResolvedValue(epoch);
    window.location.hash = '#/epochs/30/edit';

    render(<App />);

    const startFields = await screen.findByRole('group', { name: 'Data di inizio' });
    fireEvent.change(within(startFields).getByLabelText('Anno'), {
      target: { value: '2026' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Evento collegato');
    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(updateEpoch).not.toHaveBeenCalled();

    fireEvent.change(within(startFields).getByLabelText('Anno'), {
      target: { value: '2025' },
    });
    expect(screen.queryByText(/Eventi fuori dall’intervallo proposto/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salva' })).toBeEnabled();
  });

  it('warns and blocks an event definitely outside its selected epoch', async () => {
    const metadata = {
      rarity: 1,
      created_at: '2026-07-17T09:00:00Z',
      updated_at: '2026-07-17T09:00:00Z',
      created_by: 1,
      updated_by: 1,
    };
    const place = { id: 20, name: 'Luogo', description: null, ...metadata };
    const epoch = {
      id: 21,
      name: 'Epoca 2025',
      description: null,
      start_year: 2025,
      end_year: 2025,
      ...metadata,
    } as Epoch;
    vi.spyOn(api, 'places').mockResolvedValue([place]);
    vi.spyOn(api, 'epochs').mockResolvedValue([epoch]);
    const savedEvent = {
      id: 40,
      title: 'Evento nuovo',
      description: null,
      place_id: place.id,
      epoch_id: epoch.id,
      year: 2025,
      month: null,
      day: null,
      place,
      epoch,
      ...metadata,
    } as Event;
    const createEvent = vi.spyOn(api, 'createEvent').mockResolvedValue(savedEvent);
    vi.spyOn(api, 'event').mockResolvedValue(savedEvent);
    vi.spyOn(api, 'eventParticipants').mockResolvedValue([]);
    vi.spyOn(api, 'media').mockResolvedValue([]);
    window.location.hash = '#/events/new';

    render(<App />);

    await screen.findByRole('heading', { name: 'Nuovo evento' });
    fireEvent.change(screen.getByLabelText(/Titolo/), { target: { value: 'Evento nuovo' } });
    fireEvent.change(screen.getByLabelText(/Luogo/), { target: { value: String(place.id) } });
    fireEvent.change(screen.getByLabelText(/Epoca/), { target: { value: String(epoch.id) } });
    fireEvent.change(screen.getByLabelText('Anno'), { target: { value: '2024' } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'precedente all’inizio dell’epoca selezionata',
    );
    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled();
    expect(createEvent).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Anno'), { target: { value: '2025' } });
    expect(screen.queryByText(/Data fuori dall’intervallo dell’epoca/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      epoch_id: epoch.id,
      year: 2025,
    })));
  });

  it('shows the image placeholder when a listed entity has no media', async () => {
    vi.spyOn(api, 'people').mockResolvedValue([
      { id: 1, alias: 'Senza foto', sex: 'unknown', connotation: 'unknown' } as Person,
    ]);
    vi.spyOn(api, 'mediaPreviews').mockResolvedValue([]);
    window.location.hash = '#/people';

    render(<App />);

    await waitFor(() => expect(screen.getByRole('img', { name: 'Nessuna immagine' })).toBeInTheDocument());
  });

  it('reloads and revokes authenticated media when a reused ID has a new timestamp', async () => {
    const asset = {
      id: 9,
      pullable_id: 1,
      filename: 'foto.png',
      content_type: 'image/png',
      created_at: '2026-07-15T10:00:00Z',
    } as MediaAsset;
    vi.spyOn(api, 'mediaBlob').mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    const replacementAsset = {
      ...asset,
      filename: 'seconda.png',
      created_at: '2026-07-15T11:00:00Z',
    };
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce('blob:authenticated-image')
      .mockReturnValueOnce('blob:replacement-image');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    const { rerender, unmount } = render(<AuthenticatedMedia asset={asset} />);

    const image = await screen.findByRole('img', { name: 'Immagine 1 di 1' });
    expect(image).toHaveAttribute('src', 'blob:authenticated-image');
    expect(image).toHaveClass('media-carousel-image');
    expect(image.closest('.media-carousel-frame')?.querySelector('.media-carousel-backdrop')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    rerender(<AuthenticatedMedia asset={replacementAsset} />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Immagine 1 di 1' })).toHaveAttribute('src', 'blob:replacement-image'));
    expect(api.mediaBlob).toHaveBeenNthCalledWith(1, 9, '2026-07-15T10:00:00Z');
    expect(api.mediaBlob).toHaveBeenNthCalledWith(2, 9, '2026-07-15T11:00:00Z');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:authenticated-image');
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:replacement-image');
  });

  it('uploads immediately from the hidden picker and allows selecting the same file again', async () => {
    let resolveUpload!: (asset: MediaAsset) => void;
    const uploaded = new Promise<MediaAsset>((resolve) => {
      resolveUpload = resolve;
    });
    const uploadMedia = vi
      .spyOn(api, 'uploadMedia')
      .mockReturnValueOnce(uploaded)
      .mockResolvedValueOnce({ id: 12, pullable_id: 1, filename: 'ricordo.png', content_type: 'image/png' } as MediaAsset);
    const onChanged = vi.fn();
    render(<MediaSection pullableId={1} initialMedia={[]} onChanged={onChanged} />);

    const input = screen.getByLabelText('Seleziona immagine') as HTMLInputElement;
    const selectedFile = new File(['image'], 'ricordo.png', { type: 'image/png' });
    expect(input).toHaveClass('visually-hidden');
    const uploadButton = screen.getByRole('button', { name: 'Carica immagine' });
    expect(uploadButton).toHaveClass('media-gallery-action');
    const openPicker = vi.spyOn(input, 'click');
    fireEvent.click(uploadButton);
    expect(openPicker).toHaveBeenCalledOnce();

    fireEvent.change(input, { target: { files: [selectedFile] } });
    expect(uploadMedia).toHaveBeenCalledWith(selectedFile, 1);
    expect(screen.getByRole('button', { name: 'Caricamento immagine' })).toBeDisabled();

    resolveUpload({ id: 11, pullable_id: 1, filename: 'ricordo.png', content_type: 'image/png' } as MediaAsset);

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Carica immagine' })).toBeEnabled();

    fireEvent.change(input, { target: { files: [selectedFile] } });
    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
  });

  it('renders a controlled carousel and handles confirmed media deletion', async () => {
    const assets = [
      { id: 21, pullable_id: 1, filename: 'prima.png', content_type: 'image/png' },
      { id: 22, pullable_id: 1, filename: 'seconda.png', content_type: 'image/png' },
    ] as MediaAsset[];
    vi.spyOn(api, 'mediaBlob').mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const deleteMedia = vi.spyOn(api, 'deleteMedia').mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChanged = vi.fn();
    const { rerender } = render(<MediaSection pullableId={1} initialMedia={assets} onChanged={onChanged} />);

    await waitFor(() => expect(screen.getByRole('img', { name: 'Immagine 1 di 2' })).toBeInTheDocument());
    expect(screen.getByLabelText('Immagine precedente')).toBeInTheDocument();
    expect(screen.getByLabelText('Mostra immagine 1')).toHaveClass('active');
    expect(screen.getByLabelText('Apri immagine 1 di 2 a dimensione intera')).toHaveAttribute('href', 'blob:first');
    expect(screen.queryByText('prima.png')).not.toBeInTheDocument();
    expect(screen.queryByText('seconda.png')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Immagine successiva'));
    expect(screen.getByLabelText('Mostra immagine 2')).toHaveClass('active');

    fireEvent.click(screen.getByLabelText('Elimina immagine 2 di 2'));
    expect(deleteMedia).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenLastCalledWith('Eliminare definitivamente questa immagine?');
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByLabelText('Elimina immagine 2 di 2'));
    await waitFor(() => expect(deleteMedia).toHaveBeenCalledWith(22));
    expect(onChanged).toHaveBeenCalledOnce();

    rerender(<MediaSection pullableId={1} initialMedia={[assets[0]]} onChanged={onChanged} />);
    await waitFor(() => expect(screen.queryByLabelText('Immagine successiva')).not.toBeInTheDocument());
    expect(screen.queryByLabelText('Mostra immagine 1')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Immagine 1 di 1' })).toBeInTheDocument();
  });

  it('places the fixed media gallery in the detail header instead of the content stack', () => {
    const { container } = render(
      <MemoryRouter>
        <DetailShell
          title="Titolo molto lungo che può andare su più righe senza sovrapporsi"
          entityType="person"
          entityId={1}
          media={[]}
          onMediaChanged={vi.fn()}
          onDelete={vi.fn()}
        >
          <section>Contenuto descrittivo</section>
        </DetailShell>
      </MemoryRouter>,
    );

    const header = container.querySelector('.detail-header');
    const content = container.querySelector('.detail-stack');
    expect(header).toContainElement(screen.getByRole('heading'));
    expect(screen.getByText('Persona')).toBeInTheDocument();
    expect(screen.queryByText('Persona #1')).not.toBeInTheDocument();
    expect(header).not.toHaveTextContent('#1');
    expect(header?.querySelector('.media-gallery')).not.toBeNull();
    expect(content?.querySelector('.media-gallery')).toBeNull();
    expect(screen.getByLabelText('Nessuna immagine allegata')).toBeInTheDocument();
  });

  it('does not expose unexpected JavaScript upload errors', async () => {
    vi.spyOn(api, 'uploadMedia').mockRejectedValue(new Error('can\'t access property reset'));
    render(<MediaSection pullableId={1} initialMedia={[]} onChanged={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Seleziona immagine'), {
      target: { files: [new File(['image'], 'errore.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Non è stato possibile caricare l’immagine.'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('reset');
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
