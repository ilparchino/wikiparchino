import type {
  EntityType,
  Epoch,
  Event,
  EventParticipant,
  EventParticipantInput,
  LoginResponse,
  MediaAsset,
  Person,
  PersonEvent,
  PersonPlace,
  Place,
  PlacePerson,
  Profile,
  PullResult,
  SearchResult,
  User,
} from './types';
import { clearAccessToken, getAccessToken, setAccessToken } from './auth';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveApiBase(
  configuredUrl: string | undefined,
  location: Pick<Location, 'protocol' | 'hostname'> | undefined = typeof window === 'undefined' ? undefined : window.location,
): string {
  if (configuredUrl && configuredUrl.trim().length > 0) {
    return trimTrailingSlash(configuredUrl.trim());
  }

  const protocol = location?.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = location?.hostname || '127.0.0.1';
  return `${protocol}//${hostname}:8000`;
}

export const API_BASE = resolveApiBase(import.meta.env.VITE_API_URL);

type EntityPayload<T> = Omit<T, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>;
type EventPayload = Omit<EntityPayload<Event>, 'place' | 'epoch'>;

function httpErrorMessage(status: number, authenticated: boolean): string {
  if (status === 0) return 'Impossibile contattare il server. Controlla la connessione e riprova.';
  if (status === 400) return 'La richiesta non è valida. Controlla i dati e riprova.';
  if (status === 401) {
    return authenticated
      ? 'La sessione è scaduta. Accedi di nuovo per continuare.'
      : 'Username o password non corretti.';
  }
  if (status === 403) return 'Non hai i permessi necessari per questa operazione.';
  if (status === 404) return 'L’elemento richiesto non è disponibile.';
  if (status === 409) return 'L’operazione non può essere completata perché l’elemento è ancora utilizzato.';
  if (status === 413) return 'Il file selezionato è troppo grande.';
  if (status === 415) return 'Il formato del file non è supportato. Seleziona un’immagine valida.';
  if (status === 422) return 'Controlla i dati inseriti: alcuni valori non sono validi.';
  if (status === 429) return 'Sono stati effettuati troppi tentativi. Attendi qualche minuto e riprova.';
  if (status >= 500) return 'Il server non riesce a completare la richiesta. Riprova più tardi.';
  return 'Non è stato possibile completare l’operazione.';
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  readonly authenticated: boolean;

  constructor(status: number, detail: unknown, authenticated: boolean) {
    super(httpErrorMessage(status, authenticated));
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.authenticated = authenticated;
  }
}

export function formatError(
  error: unknown,
  fallback = 'Si è verificato un errore inatteso. Riprova.',
): string {
  return error instanceof ApiError ? error.message : fallback;
}

async function responseFor(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (authenticated && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    throw new ApiError(0, error, authenticated);
  }
  if (!response.ok) {
    if (authenticated && response.status === 401) {
      clearAccessToken();
    }
    let detail: unknown = null;
    try {
      const payload = await response.json();
      detail = payload.detail ?? null;
    } catch {
      // The status is sufficient to produce a safe user-facing message.
    }
    throw new ApiError(response.status, detail, authenticated);
  }
  return response;
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const response = await responseFor(path, init, authenticated);
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  login: async (username: string, password: string) => {
    const session = await request<LoginResponse>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) },
      false,
    );
    setAccessToken(session.access_token);
    return session.user;
  },
  logout: async () => {
    try {
      await request<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      clearAccessToken();
    }
  },
  me: () => request<User>('/api/me'),
  profile: () => request<Profile>('/api/profile'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/api/profile/password', {
      method: 'PUT',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),

  people: () => request<Person[]>('/api/people'),
  person: (id: number) => request<Person>(`/api/people/${id}`),
  createPerson: (payload: EntityPayload<Person>) =>
    request<Person>('/api/people', { method: 'POST', body: JSON.stringify(payload) }),
  updatePerson: (id: number, payload: EntityPayload<Person>) =>
    request<Person>(`/api/people/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deletePerson: (id: number) => request<void>(`/api/people/${id}`, { method: 'DELETE' }),

  places: () => request<Place[]>('/api/places'),
  place: (id: number) => request<Place>(`/api/places/${id}`),
  createPlace: (payload: EntityPayload<Place>) =>
    request<Place>('/api/places', { method: 'POST', body: JSON.stringify(payload) }),
  updatePlace: (id: number, payload: EntityPayload<Place>) =>
    request<Place>(`/api/places/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deletePlace: (id: number) => request<void>(`/api/places/${id}`, { method: 'DELETE' }),

  epochs: () => request<Epoch[]>('/api/epochs'),
  epoch: (id: number) => request<Epoch>(`/api/epochs/${id}`),
  createEpoch: (payload: EntityPayload<Epoch>) =>
    request<Epoch>('/api/epochs', { method: 'POST', body: JSON.stringify(payload) }),
  updateEpoch: (id: number, payload: EntityPayload<Epoch>) =>
    request<Epoch>(`/api/epochs/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEpoch: (id: number) => request<void>(`/api/epochs/${id}`, { method: 'DELETE' }),

  events: () => request<Event[]>('/api/events'),
  event: (id: number) => request<Event>(`/api/events/${id}`),
  createEvent: (payload: EventPayload) =>
    request<Event>('/api/events', { method: 'POST', body: JSON.stringify(payload) }),
  updateEvent: (id: number, payload: EventPayload) =>
    request<Event>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEvent: (id: number) => request<void>(`/api/events/${id}`, { method: 'DELETE' }),

  search: (query: string) => request<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`),
  randomPull: (entityType?: EntityType) =>
    request<PullResult>(`/api/pulls/random${entityType ? `?entity_type=${entityType}` : ''}`),
  dailyPull: (entityType?: EntityType) =>
    request<PullResult>(`/api/pulls/daily${entityType ? `?entity_type=${entityType}` : ''}`),

  eventParticipants: (eventId: number) => request<EventParticipant[]>(`/api/events/${eventId}/participants`),
  replaceEventParticipants: (eventId: number, payload: EventParticipantInput[]) =>
    request<EventParticipant[]>(`/api/events/${eventId}/participants`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  personEvents: (personId: number) => request<PersonEvent[]>(`/api/people/${personId}/events`),
  personPlaces: (personId: number) => request<PersonPlace[]>(`/api/people/${personId}/places`),
  replacePersonPlaces: (personId: number, payload: Array<Omit<PersonPlace, 'person_id' | 'place'>>) =>
    request<PersonPlace[]>(`/api/people/${personId}/places`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  placePeople: (placeId: number) => request<PlacePerson[]>(`/api/places/${placeId}/people`),
  placeEvents: (placeId: number) => request<Event[]>(`/api/places/${placeId}/events`),
  epochEvents: (epochId: number) => request<Event[]>(`/api/epochs/${epochId}/events`),

  media: (pullableId: number) => request<MediaAsset[]>(`/api/media?pullable_id=${pullableId}`),
  mediaPreviews: (pullableIds: number[]) => {
    const query = new URLSearchParams();
    pullableIds.forEach((id) => query.append('pullable_id', String(id)));
    return request<MediaAsset[]>(`/api/media/previews?${query.toString()}`);
  },
  mediaBlob: async (id: number, createdAt?: string) => {
    const version = createdAt ? `?version=${encodeURIComponent(createdAt)}` : '';
    return (await responseFor(`/api/media/${id}${version}`, { cache: 'no-store' })).blob();
  },
  deleteMedia: (id: number) => request<void>(`/api/media/${id}`, { method: 'DELETE' }),
  uploadMedia: (file: File, pullableId: number) => {
    const body = new FormData();
    body.append('file', file);
    body.append('pullable_id', String(pullableId));
    return request<MediaAsset>('/api/media', { method: 'POST', body });
  },
};
