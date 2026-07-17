import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App, { AuthenticatedMedia, DetailShell, EventParticipantsEditor, LinkedEvents, MediaSection } from './App';
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
      { id: 1, alias: 'Dino', sex: 'male', connotation: 'positive', ...metadata } as Person,
    ]);
    vi.spyOn(api, 'places').mockResolvedValue([
      { id: 2, name: 'Parchino', description: null, ...metadata },
    ]);
    vi.spyOn(api, 'epochs').mockResolvedValue([
      { id: 3, name: 'Post-Covid', description: null, ...metadata },
    ]);
    vi.spyOn(api, 'events').mockResolvedValue([
      { id: 4, title: 'APPoti APPiedi', place_id: 2, epoch_id: 3, ...metadata },
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

    for (const [route, label] of [
      ['#/people', 'Dino'],
      ['#/places', 'Parchino'],
      ['#/epochs', 'Post-Covid'],
      ['#/events', 'APPoti APPiedi'],
    ]) {
      window.location.hash = route;
      render(<App />);
      await waitFor(() => expect(screen.getByRole('img', { name: `Anteprima di ${label}` })).toBeInTheDocument());
      expect(screen.getByRole('img', { name: `Anteprima di ${label}` }).closest('.entity-preview')).toBeInTheDocument();
      expect(screen.queryByText('non-visibile.png')).not.toBeInTheDocument();
      cleanup();
    }
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

    await waitFor(() => expect(screen.getByRole('img', { name: 'Immagine 1 di 1' })).toHaveAttribute('src', 'blob:authenticated-image'));
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
