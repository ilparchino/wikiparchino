import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DependencyList, type FormEvent, type ReactNode } from 'react';
import {
  HashRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { api, formatError } from './api';
import { getAccessToken, subscribeToSessionLoss } from './auth';
import type {
  Connotation,
  EntityType,
  Epoch,
  Event,
  EventParticipant,
  MediaAsset,
  Person,
  PersonEvent,
  PersonPlace,
  Place,
  PlacePerson,
  PullResult,
  SearchResult,
  Sex,
  User,
} from './types';

const entityLabels: Record<EntityType, string> = {
  person: 'Persona',
  place: 'Luogo',
  epoch: 'Epoca',
  event: 'Evento',
};

const entityPluralLabels: Record<EntityType, string> = {
  person: 'Persone',
  place: 'Luoghi',
  epoch: 'Epoche',
  event: 'Eventi',
};

const entityPaths: Record<EntityType, string> = {
  person: '/people',
  place: '/places',
  epoch: '/epochs',
  event: '/events',
};

const sexLabels: Record<Sex, string> = {
  male: 'Maschile',
  female: 'Femminile',
  other: 'Altro',
  unknown: 'Sconosciuto',
};

const connotationLabels: Record<Connotation, string> = {
  positive: 'Positiva',
  negative: 'Negativa',
  neutral: 'Neutra',
  unknown: 'Sconosciuta',
};

function assetPath(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

const seasonConfig = {
  spring: { logo: assetPath('brand/logo-spring.png'), label: 'Primavera' },
  summer: { logo: assetPath('brand/logo-summer.png'), label: 'Estate' },
  autumn: { logo: assetPath('brand/logo-autumn.png'), label: 'Autunno' },
  winter: { logo: assetPath('brand/logo-winter.png'), label: 'Inverno' },
} as const;

type Season = keyof typeof seasonConfig;

function detailPath(entityType: EntityType, id: number): string {
  return `${entityPaths[entityType]}/${id}`;
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function formatDate(event: Pick<Event, 'year' | 'month' | 'day'>): string {
  if (!event.year) return 'Data sconosciuta';
  const month = event.month ? String(event.month).padStart(2, '0') : null;
  const day = event.day ? String(event.day).padStart(2, '0') : null;
  return [event.year, month, day].filter(Boolean).join('-');
}

function getSeason(date: Date): Season {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const code = month * 100 + day;
  if (code >= 320 && code < 621) return 'spring';
  if (code >= 621 && code < 922) return 'summer';
  if (code >= 922 && code < 1221) return 'autumn';
  return 'winter';
}

function parseRouteId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function useAsync<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loader()
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatError(err, 'Non è stato possibile caricare i dati.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, version]);

  return { data, loading, error, reload: () => setVersion((current) => current + 1) };
}

function Loading() {
  return (
    <div className="d-flex align-items-center gap-2 py-5 text-secondary">
      <div className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
      <span>Caricamento...</span>
    </div>
  );
}

function ErrorAlert({ message }: { message: string; }) {
  return (
    <div className="alert alert-danger" role="alert">
      {message}
    </div>
  );
}

function EmptyState({ children }: { children: string; }) {
  return <div className="border rounded p-4 text-center text-secondary bg-white">{children}</div>;
}

function RequiredMark() {
  return <span className="text-danger ms-1">*</span>;
}

function App() {
  return (
    <HashRouter>
      <AppRoot />
    </HashRouter>
  );
}

function AppRoot() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return subscribeToSessionLoss(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="container py-5">
        <Loading />
      </main>
    );
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return <AuthenticatedApp user={user} onLogout={() => setUser(null)} />;
}

function LoginPage({ onLogin }: { onLogin: (user: User) => void; }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const season = getSeason(new Date());
  const seasonData = seasonConfig[season];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onLogin(await api.login(username, password));
    } catch (err) {
      setError(formatError(err, 'Non è stato possibile effettuare l’accesso.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={`login-page season-${season}`}>
      <div className="container">
        <div className="row min-vh-100 align-items-center justify-content-center">
          <div className="col-12 col-lg-9 col-xl-8">
            <div className="card login-card shadow-lg border-0 overflow-hidden">
              <div className="row g-0 align-items-stretch">
                <div className="col-md-6 login-brand-panel d-flex align-items-center justify-content-center p-4">
                  <img className="login-logo img-fluid" src={seasonData.logo} alt="Wiki Parchino" />
                </div>
                <div className="col-md-6">
                  <form className="card-body p-4 p-lg-5" onSubmit={submit}>
                    <p className="text-uppercase small fw-semibold text-secondary mb-2">{seasonData.label}</p>
                    <h1 className="h3 mb-3">Accedi a Wiki Parchino</h1>
                    <p className="text-secondary">Un'estesa wiki della lore del Parchino.</p>
                    {error && <ErrorAlert message={error} />}
                    <div className="mb-3">
                      <label className="form-label" htmlFor="username">
                        Username
                        <RequiredMark />
                      </label>
                      <input
                        className="form-control"
                        id="username"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        autoComplete="username"
                        required
                      />
                    </div>
                    <div className="mb-4">
                      <label className="form-label" htmlFor="password">
                        Password
                        <RequiredMark />
                      </label>
                      <input
                        className="form-control"
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </div>
                    <button className="btn btn-primary w-100" type="submit" disabled={submitting}>
                      <i className="bi bi-box-arrow-in-right me-2" />
                      {submitting ? 'Accesso...' : 'Entra'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function AuthenticatedApp({ user, onLogout }: { user: User; onLogout: () => void; }) {
  const [open, setOpen] = useState(false);

  async function logout() {
    try {
      await api.logout();
    } finally {
      onLogout();
    }
  }

  return (
    <>
      <nav className="navbar navbar-expand-lg bg-body border-bottom sticky-top">
        <div className="container-fluid">
          <Link className="navbar-brand d-flex align-items-center gap-2" to="/" onClick={() => setOpen(false)}>
            <img src={assetPath('brand/logo-mono.png')} alt="" width="38" height="26" className="object-fit-contain" />
            <span>Wiki Parchino</span>
          </Link>
          <button
            className="navbar-toggler"
            type="button"
            aria-controls="main-navbar"
            aria-expanded={open}
            aria-label="Apri navigazione"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className={`collapse navbar-collapse ${open ? 'show' : ''}`} id="main-navbar">
            <div className="navbar-nav me-auto">
              <NavItem to="/" label="Bacheca" icon="bi-grid-1x2" onClick={() => setOpen(false)} end />
              <NavItem to="/people" label="Persone" icon="bi-people" onClick={() => setOpen(false)} />
              <NavItem to="/places" label="Luoghi" icon="bi-geo-alt" onClick={() => setOpen(false)} />
              <NavItem to="/epochs" label="Epoche" icon="bi-hourglass-split" onClick={() => setOpen(false)} />
              <NavItem to="/events" label="Eventi" icon="bi-calendar-event" onClick={() => setOpen(false)} />
              <NavItem to="/search" label="Cerca" icon="bi-search" onClick={() => setOpen(false)} />
              <NavItem to="/pulls" label="Estrazioni" icon="bi-shuffle" onClick={() => setOpen(false)} />
            </div>
            <div className="d-flex align-items-center gap-2">
              <span className="navbar-text small">{user.display_name}</span>
              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={logout}>
                <i className="bi bi-box-arrow-right me-1" />
                Esci
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="container-fluid app-container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/people" element={<PeopleList />} />
          <Route path="/people/new" element={<PersonForm mode="create" />} />
          <Route path="/people/:id" element={<PersonDetail />} />
          <Route path="/people/:id/edit" element={<PersonForm mode="edit" />} />
          <Route path="/places" element={<PlacesList />} />
          <Route path="/places/new" element={<PlaceForm mode="create" />} />
          <Route path="/places/:id" element={<PlaceDetail />} />
          <Route path="/places/:id/edit" element={<PlaceForm mode="edit" />} />
          <Route path="/epochs" element={<EpochsList />} />
          <Route path="/epochs/new" element={<EpochForm mode="create" />} />
          <Route path="/epochs/:id" element={<EpochDetail />} />
          <Route path="/epochs/:id/edit" element={<EpochForm mode="edit" />} />
          <Route path="/events" element={<EventsList />} />
          <Route path="/events/new" element={<EventForm mode="create" />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/events/:id/edit" element={<EventForm mode="edit" />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/pulls" element={<PullsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

function NavItem({
  to,
  label,
  icon,
  onClick,
  end,
}: {
  to: string;
  label: string;
  icon: string;
  onClick: () => void;
  end?: boolean;
}) {
  return (
    <NavLink className="nav-link" to={to} end={end} onClick={onClick}>
      <i className={`bi ${icon} me-1`} />
      {label}
    </NavLink>
  );
}

function Dashboard() {
  const { data, loading, error } = useAsync(
    () => Promise.all([api.people(), api.places(), api.epochs(), api.events(), api.dailyPull()]),
    [],
  );

  if (loading) return <Loading />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  const [people, places, epochs, events, daily] = data;
  return (
    <section>
      <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-end mb-4">
        <div>
          <h1 className="h2 mb-1">Bacheca</h1>
          <p className="text-secondary mb-0">Panoramica rapida dell'archivio Parchino.</p>
        </div>
        <Link className="btn btn-primary" to="/events/new">
          <i className="bi bi-plus-lg me-2" />
          Nuovo evento
        </Link>
      </div>
      <div className="row g-3 mb-4">
        <MetricCard label="Persone" value={people.length} to="/people" icon="bi-people" />
        <MetricCard label="Luoghi" value={places.length} to="/places" icon="bi-geo-alt" />
        <MetricCard label="Epoche" value={epochs.length} to="/epochs" icon="bi-hourglass-split" />
        <MetricCard label="Eventi" value={events.length} to="/events" icon="bi-calendar-event" />
      </div>
      <div className="row g-4">
        <div className="col-lg-5">
          <section className="border rounded bg-white p-4 h-100">
            <h2 className="h5">Elemento del giorno</h2>
            <p className="text-secondary mb-3">{entityLabels[daily.entity_type]} con rarità {daily.rarity}</p>
            <Link className="fs-4 fw-semibold text-decoration-none" to={detailPath(daily.entity_type, daily.id)}>
              {daily.title}
            </Link>
          </section>
        </div>
        <div className="col-lg-7">
          <section className="border rounded bg-white p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="h5 mb-0">Ultimi eventi</h2>
              <Link className="btn btn-outline-primary btn-sm" to="/events">Vedi tutti</Link>
            </div>
            <div className="list-group list-group-flush">
              {events.slice(0, 5).map((event) => (
                <Link className="list-group-item list-group-item-action px-0" to={`/events/${event.id}`} key={event.id}>
                  <div className="d-flex justify-content-between gap-3">
                    <span className="fw-semibold">{event.title}</span>
                    <span className="text-secondary small">{formatDate(event)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, to, icon }: { label: string; value: number; to: string; icon: string; }) {
  return (
    <div className="col-6 col-xl-3">
      <Link className="metric-card border rounded bg-white p-3 text-decoration-none d-block" to={to}>
        <div className="d-flex align-items-center justify-content-between">
          <span className="text-secondary">{label}</span>
          <i className={`bi ${icon} text-primary`} />
        </div>
        <strong className="display-6">{value}</strong>
      </Link>
    </div>
  );
}

function PeopleList() {
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useAsync(api.people, []);
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (data ?? []).filter((person) =>
      [person.alias, person.name, person.surname, person.description].some((value) =>
        (value ?? '').toLowerCase().includes(term),
      ),
    );
  }, [data, filter]);

  return (
    <ListPage title="Persone" createTo="/people/new" filter={filter} onFilter={setFilter}>
      {loading && <Loading />}
      {error && <ErrorAlert message={error} />}
      {!loading && filtered.length === 0 && <EmptyState>Nessuna persona trovata.</EmptyState>}
      <div className="row g-3">
        {filtered.map((person) => (
          <div className="col-md-6 col-xl-4" key={person.id}>
            <Link className="entity-card border rounded bg-white p-3 d-block text-decoration-none h-100" to={`/people/${person.id}`}>
              <span className="badge text-bg-light mb-2">{connotationLabels[person.connotation]}</span>
              <h2 className="h5 mb-1">{person.alias}</h2>
              <p className="text-secondary mb-2">{[person.name, person.surname].filter(Boolean).join(' ') || sexLabels[person.sex]}</p>
              <p className="small text-secondary mb-0">{person.description || 'Nessuna descrizione.'}</p>
            </Link>
          </div>
        ))}
      </div>
    </ListPage>
  );
}

function PlacesList() {
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useAsync(api.places, []);
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (data ?? []).filter((place) => [place.name, place.description].some((value) => (value ?? '').toLowerCase().includes(term)));
  }, [data, filter]);

  return (
    <ListPage title="Luoghi" createTo="/places/new" filter={filter} onFilter={setFilter}>
      {loading && <Loading />}
      {error && <ErrorAlert message={error} />}
      {!loading && filtered.length === 0 && <EmptyState>Nessun luogo trovato.</EmptyState>}
      <EntityList items={filtered} entityType="place" titleFor={(place) => place.name} subtitleFor={(place) => place.description} />
    </ListPage>
  );
}

function EpochsList() {
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useAsync(api.epochs, []);
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (data ?? []).filter((epoch) => [epoch.name, epoch.description].some((value) => (value ?? '').toLowerCase().includes(term)));
  }, [data, filter]);

  return (
    <ListPage title="Epoche" createTo="/epochs/new" filter={filter} onFilter={setFilter}>
      {loading && <Loading />}
      {error && <ErrorAlert message={error} />}
      {!loading && filtered.length === 0 && <EmptyState>Nessuna epoca trovata.</EmptyState>}
      <EntityList items={filtered} entityType="epoch" titleFor={(epoch) => epoch.name} subtitleFor={(epoch) => epoch.description} />
    </ListPage>
  );
}

function EventsList() {
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useAsync(api.events, []);
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (data ?? []).filter((event) =>
      [event.title, event.description, event.place?.name, event.epoch?.name].some((value) => (value ?? '').toLowerCase().includes(term)),
    );
  }, [data, filter]);

  return (
    <ListPage title="Eventi" createTo="/events/new" filter={filter} onFilter={setFilter}>
      {loading && <Loading />}
      {error && <ErrorAlert message={error} />}
      {!loading && filtered.length === 0 && <EmptyState>Nessun evento trovato.</EmptyState>}
      <div className="list-group">
        {filtered.map((event) => (
          <Link className="list-group-item list-group-item-action" to={`/events/${event.id}`} key={event.id}>
            <div className="d-flex flex-column flex-md-row justify-content-between gap-2">
              <div>
                <h2 className="h5 mb-1">{event.title}</h2>
                <p className="mb-1 text-secondary">{event.description || 'Nessuna descrizione.'}</p>
                <small>{event.place?.name} · {event.epoch?.name}</small>
              </div>
              <span className="text-secondary">{formatDate(event)}</span>
            </div>
          </Link>
        ))}
      </div>
    </ListPage>
  );
}

function ListPage({
  title,
  createTo,
  filter,
  onFilter,
  children,
}: {
  title: string;
  createTo: string;
  filter: string;
  onFilter: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-end mb-4">
        <div>
          <h1 className="h2 mb-1">{title}</h1>
          <p className="text-secondary mb-0">Sfoglia, filtra e apri le schede dedicate.</p>
        </div>
        <Link className="btn btn-primary" to={createTo}>
          <i className="bi bi-plus-lg me-2" />
          Crea
        </Link>
      </div>
      <div className="input-group mb-4">
        <span className="input-group-text">
          <i className="bi bi-search" />
        </span>
        <input
          className="form-control"
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          placeholder="Filtra per nome o descrizione"
        />
      </div>
      {children}
    </section>
  );
}

function EntityList<T extends { id: number; }>({
  items,
  entityType,
  titleFor,
  subtitleFor,
}: {
  items: T[];
  entityType: EntityType;
  titleFor: (item: T) => string;
  subtitleFor: (item: T) => string | null | undefined;
}) {
  return (
    <div className="row g-3">
      {items.map((item) => (
        <div className="col-md-6 col-xl-4" key={item.id}>
          <Link className="entity-card border rounded bg-white p-3 d-block text-decoration-none h-100" to={detailPath(entityType, item.id)}>
            <span className="badge text-bg-light mb-2">{entityLabels[entityType]}</span>
            <h2 className="h5 mb-1">{titleFor(item)}</h2>
            <p className="small text-secondary mb-0">{subtitleFor(item) || 'Nessuna descrizione.'}</p>
          </Link>
        </div>
      ))}
    </div>
  );
}

function PersonForm({ mode }: { mode: 'create' | 'edit'; }) {
  const { id } = useParams();
  const personId = parseRouteId(id);
  const navigate = useNavigate();
  const isEdit = mode === 'edit';
  const { data, loading, error } = useAsync(() => (isEdit && personId ? api.person(personId) : Promise.resolve(null)), [mode, personId]);
  const [draft, setDraft] = useState({
    alias: '',
    name: '',
    surname: '',
    sex: 'unknown' as Sex,
    connotation: 'unknown' as Connotation,
    description: '',
    rarity: '1',
  });
  const [validated, setValidated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setDraft({
        alias: data.alias,
        name: data.name ?? '',
        surname: data.surname ?? '',
        sex: data.sex,
        connotation: data.connotation,
        description: data.description ?? '',
        rarity: String(data.rarity),
      });
    }
  }, [data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidated(true);
    if (!event.currentTarget.checkValidity()) return;
    setSubmitError(null);
    try {
      const payload = {
        alias: draft.alias.trim(),
        name: cleanOptional(draft.name),
        surname: cleanOptional(draft.surname),
        sex: draft.sex,
        connotation: draft.connotation,
        description: cleanOptional(draft.description),
        rarity: Number(draft.rarity),
      };
      const saved = isEdit && personId ? await api.updatePerson(personId, payload) : await api.createPerson(payload);
      navigate(`/people/${saved.id}`);
    } catch (err) {
      setSubmitError(formatError(err, 'Non è stato possibile salvare le modifiche.'));
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorAlert message={error} />;

  return (
    <EntityFormShell title={isEdit ? 'Modifica persona' : 'Nuova persona'} backTo={isEdit && personId ? `/people/${personId}` : '/people'}>
      {submitError && <ErrorAlert message={submitError} />}
      <form className={validated ? 'was-validated' : ''} noValidate onSubmit={submit}>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label" htmlFor="alias">Alias<RequiredMark /></label>
            <input className="form-control" id="alias" required value={draft.alias} onChange={(event) => setDraft({ ...draft, alias: event.target.value })} />
            <div className="invalid-feedback">Inserisci un alias.</div>
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="name">Nome</label>
            <input className="form-control" id="name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="surname">Cognome</label>
            <input className="form-control" id="surname" value={draft.surname} onChange={(event) => setDraft({ ...draft, surname: event.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="sex">Sesso<RequiredMark /></label>
            <select className="form-select" id="sex" required value={draft.sex} onChange={(event) => setDraft({ ...draft, sex: event.target.value as Sex })}>
              {Object.entries(sexLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="connotation">Connotazione<RequiredMark /></label>
            <select className="form-select" id="connotation" required value={draft.connotation} onChange={(event) => setDraft({ ...draft, connotation: event.target.value as Connotation })}>
              {Object.entries(connotationLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <RarityInput value={draft.rarity} onChange={(rarity) => setDraft({ ...draft, rarity })} />
          </div>
          <div className="col-12">
            <label className="form-label" htmlFor="description">Descrizione</label>
            <textarea className="form-control" id="description" rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
        </div>
        <FormActions cancelTo={isEdit && personId ? `/people/${personId}` : '/people'} />
      </form>
    </EntityFormShell>
  );
}

function PlaceForm({ mode }: { mode: 'create' | 'edit'; }) {
  return <NamedEntityForm<Place> mode={mode} entityType="place" load={api.place} create={api.createPlace} update={api.updatePlace} />;
}

function EpochForm({ mode }: { mode: 'create' | 'edit'; }) {
  return <NamedEntityForm<Epoch> mode={mode} entityType="epoch" load={api.epoch} create={api.createEpoch} update={api.updateEpoch} />;
}

function NamedEntityForm<T extends Place | Epoch>({
  mode,
  entityType,
  load,
  create,
  update,
}: {
  mode: 'create' | 'edit';
  entityType: 'place' | 'epoch';
  load: (id: number) => Promise<T>;
  create: (payload: { name: string; description: string | null; rarity: number; }) => Promise<T>;
  update: (id: number, payload: { name: string; description: string | null; rarity: number; }) => Promise<T>;
}) {
  const { id } = useParams();
  const entityId = parseRouteId(id);
  const navigate = useNavigate();
  const isEdit = mode === 'edit';
  const { data, loading, error } = useAsync(() => (isEdit && entityId ? load(entityId) : Promise.resolve(null)), [mode, entityId]);
  const [draft, setDraft] = useState({ name: '', description: '', rarity: '1' });
  const [validated, setValidated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDraft({ name: data.name, description: data.description ?? '', rarity: String(data.rarity) });
  }, [data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidated(true);
    if (!event.currentTarget.checkValidity()) return;
    setSubmitError(null);
    try {
      const payload = { name: draft.name.trim(), description: cleanOptional(draft.description), rarity: Number(draft.rarity) };
      const saved = isEdit && entityId ? await update(entityId, payload) : await create(payload);
      navigate(detailPath(entityType, saved.id));
    } catch (err) {
      setSubmitError(formatError(err, 'Non è stato possibile salvare le modifiche.'));
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorAlert message={error} />;

  const title = `${isEdit ? 'Modifica' : 'Nuovo'} ${entityLabels[entityType].toLowerCase()}`;
  const cancelTo = isEdit && entityId ? detailPath(entityType, entityId) : entityPaths[entityType];
  return (
    <EntityFormShell title={title} backTo={cancelTo}>
      {submitError && <ErrorAlert message={submitError} />}
      <form className={validated ? 'was-validated' : ''} noValidate onSubmit={submit}>
        <div className="row g-3">
          <div className="col-md-8">
            <label className="form-label" htmlFor="name">Nome<RequiredMark /></label>
            <input className="form-control" id="name" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <div className="invalid-feedback">Inserisci un nome.</div>
          </div>
          <div className="col-md-4">
            <RarityInput value={draft.rarity} onChange={(rarity) => setDraft({ ...draft, rarity })} />
          </div>
          <div className="col-12">
            <label className="form-label" htmlFor="description">Descrizione</label>
            <textarea className="form-control" id="description" rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
        </div>
        <FormActions cancelTo={cancelTo} />
      </form>
    </EntityFormShell>
  );
}

function EventForm({ mode }: { mode: 'create' | 'edit'; }) {
  const { id } = useParams();
  const eventId = parseRouteId(id);
  const navigate = useNavigate();
  const isEdit = mode === 'edit';
  const { data, loading, error } = useAsync(
    () => Promise.all([api.places(), api.epochs(), isEdit && eventId ? api.event(eventId) : Promise.resolve(null)]),
    [mode, eventId],
  );
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    place_id: '',
    epoch_id: '',
    year: '',
    month: '',
    day: '',
    rarity: '1',
  });
  const [validated, setValidated] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const event = data?.[2];
    if (event) {
      setDraft({
        title: event.title,
        description: event.description ?? '',
        place_id: String(event.place_id),
        epoch_id: String(event.epoch_id),
        year: event.year ? String(event.year) : '',
        month: event.month ? String(event.month) : '',
        day: event.day ? String(event.day) : '',
        rarity: String(event.rarity),
      });
    }
  }, [data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidated(true);
    setDateError(null);
    if (draft.month && !draft.year) {
      setDateError('Il mese richiede anche l\'anno.');
      return;
    }
    if (draft.day && !draft.month) {
      setDateError('Il giorno richiede anche il mese.');
      return;
    }
    if (!event.currentTarget.checkValidity()) return;
    setSubmitError(null);
    try {
      const payload = {
        title: draft.title.trim(),
        description: cleanOptional(draft.description),
        place_id: Number(draft.place_id),
        epoch_id: Number(draft.epoch_id),
        year: nullableNumber(draft.year),
        month: nullableNumber(draft.month),
        day: nullableNumber(draft.day),
        rarity: Number(draft.rarity),
      };
      const saved = isEdit && eventId ? await api.updateEvent(eventId, payload) : await api.createEvent(payload);
      navigate(`/events/${saved.id}`);
    } catch (err) {
      setSubmitError(formatError(err, 'Non è stato possibile salvare le modifiche.'));
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  const [places, epochs] = data;
  const cancelTo = isEdit && eventId ? `/events/${eventId}` : '/events';
  return (
    <EntityFormShell title={isEdit ? 'Modifica evento' : 'Nuovo evento'} backTo={cancelTo}>
      {submitError && <ErrorAlert message={submitError} />}
      {dateError && <ErrorAlert message={dateError} />}
      {(places.length === 0 || epochs.length === 0) && (
        <div className="alert alert-warning">Per creare un evento servono almeno un luogo e un'epoca.</div>
      )}
      <form className={validated ? 'was-validated' : ''} noValidate onSubmit={submit}>
        <div className="row g-3">
          <div className="col-md-8">
            <label className="form-label" htmlFor="title">Titolo<RequiredMark /></label>
            <input className="form-control" id="title" required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            <div className="invalid-feedback">Inserisci un titolo.</div>
          </div>
          <div className="col-md-4">
            <RarityInput value={draft.rarity} onChange={(rarity) => setDraft({ ...draft, rarity })} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="place">Luogo<RequiredMark /></label>
            <select className="form-select" id="place" required value={draft.place_id} onChange={(event) => setDraft({ ...draft, place_id: event.target.value })}>
              <option value="">Scegli luogo</option>
              {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
            </select>
            <div className="invalid-feedback">Seleziona un luogo.</div>
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="epoch">Epoca<RequiredMark /></label>
            <select className="form-select" id="epoch" required value={draft.epoch_id} onChange={(event) => setDraft({ ...draft, epoch_id: event.target.value })}>
              <option value="">Scegli epoca</option>
              {epochs.map((epoch) => <option key={epoch.id} value={epoch.id}>{epoch.name}</option>)}
            </select>
            <div className="invalid-feedback">Seleziona un'epoca.</div>
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="year">Anno</label>
            <input className="form-control" id="year" type="number" min="1900" value={draft.year} onChange={(event) => setDraft({ ...draft, year: event.target.value })} placeholder="yyyy" />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="month">Mese</label>
            <input className="form-control" id="month" type="number" min="1" max="12" value={draft.month} onChange={(event) => setDraft({ ...draft, month: event.target.value })} placeholder="mm" />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="day">Giorno</label>
            <input className="form-control" id="day" type="number" min="1" max="31" value={draft.day} onChange={(event) => setDraft({ ...draft, day: event.target.value })} placeholder="dd" />
          </div>
          <div className="col-12">
            <label className="form-label" htmlFor="description">Descrizione</label>
            <textarea className="form-control" id="description" rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
        </div>
        <FormActions cancelTo={cancelTo} />
      </form>
    </EntityFormShell>
  );
}

function RarityInput({ value, onChange }: { value: string; onChange: (value: string) => void; }) {
  return (
    <>
      <label className="form-label" htmlFor="rarity">Rarità<RequiredMark /></label>
      <input className="form-control" id="rarity" type="number" min="0.01" step="0.01" required value={value} onChange={(event) => onChange(event.target.value)} />
      <div className="invalid-feedback">Inserisci una rarità maggiore di zero.</div>
    </>
  );
}

function EntityFormShell({ title, backTo, children }: { title: string; backTo: string; children: ReactNode; }) {
  return (
    <section className="mx-auto form-page">
      <div className="d-flex justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h1 className="h2 mb-1">{title}</h1>
          <p className="text-secondary mb-0">I campi obbligatori sono contrassegnati.</p>
        </div>
        <Link className="btn btn-outline-secondary" to={backTo}>
          <i className="bi bi-arrow-left me-2" />
          Indietro
        </Link>
      </div>
      <div className="border rounded bg-white p-4">{children}</div>
    </section>
  );
}

function FormActions({ cancelTo }: { cancelTo: string; }) {
  return (
    <div className="d-flex justify-content-end gap-2 mt-4">
      <Link className="btn btn-outline-secondary" to={cancelTo}>Annulla</Link>
      <button className="btn btn-primary" type="submit">
        <i className="bi bi-check-lg me-2" />
        Salva
      </button>
    </div>
  );
}

function PersonDetail() {
  const parsedPersonId = parseRouteId(useParams().id);
  const personId = parsedPersonId ?? 0;
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(
    () =>
      parsedPersonId
        ? Promise.all([api.person(personId), api.personPlaces(personId), api.personEvents(personId), api.media(personId)])
        : Promise.resolve(null),
    [personId, parsedPersonId],
  );

  async function remove() {
    if (!window.confirm('Eliminare definitivamente questa persona?')) return;
    await api.deletePerson(personId);
    navigate('/people');
  }

  if (!parsedPersonId) return <ErrorAlert message="Persona non valida." />;
  if (loading) return <Loading />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;
  const [person, places, events, media] = data;

  return (
    <DetailShell title={person.alias} entityType="person" entityId={person.id} media={media} onMediaChanged={reload} onDelete={remove}>
      <InfoGrid
        items={[
          ['Nome', [person.name, person.surname].filter(Boolean).join(' ') || 'Non indicato'],
          ['Sesso', sexLabels[person.sex]],
          ['Connotazione', connotationLabels[person.connotation]],
          ['Rarità', String(person.rarity)],
        ]}
      />
      <Description text={person.description} />
      <PersonPlacesEditor personId={person.id} initialLinks={places} />
      <LinkedEvents events={events} />
    </DetailShell>
  );
}

function PlaceDetail() {
  const parsedPlaceId = parseRouteId(useParams().id);
  const placeId = parsedPlaceId ?? 0;
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(
    () =>
      parsedPlaceId
        ? Promise.all([api.place(placeId), api.placePeople(placeId), api.placeEvents(placeId), api.media(placeId)])
        : Promise.resolve(null),
    [placeId, parsedPlaceId],
  );

  async function remove() {
    if (!window.confirm('Eliminare definitivamente questo luogo?')) return;
    setDeleteError(null);
    try {
      await api.deletePlace(placeId);
      navigate('/places');
    } catch (err) {
      setDeleteError(formatError(err, 'Non è stato possibile eliminare l’elemento.'));
    }
  }

  if (!parsedPlaceId) return <ErrorAlert message="Luogo non valido." />;
  if (loading) return <Loading />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;
  const [place, people, events, media] = data;

  return (
    <DetailShell title={place.name} entityType="place" entityId={place.id} media={media} onMediaChanged={reload} onDelete={remove}>
      {deleteError && <ErrorAlert message={deleteError} />}
      <InfoGrid items={[['Rarità', String(place.rarity)], ['Eventi collegati', String(events.length)], ['Persone collegate', String(people.length)]]} />
      <Description text={place.description} />
      <LinkedPeople links={people} />
      <EventListSection title="Eventi in questo luogo" events={events} />
    </DetailShell>
  );
}

function EpochDetail() {
  const parsedEpochId = parseRouteId(useParams().id);
  const epochId = parsedEpochId ?? 0;
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(
    () => (parsedEpochId ? Promise.all([api.epoch(epochId), api.epochEvents(epochId), api.media(epochId)]) : Promise.resolve(null)),
    [epochId, parsedEpochId],
  );

  async function remove() {
    if (!window.confirm('Eliminare definitivamente questa epoca?')) return;
    setDeleteError(null);
    try {
      await api.deleteEpoch(epochId);
      navigate('/epochs');
    } catch (err) {
      setDeleteError(formatError(err, 'Non è stato possibile eliminare l’elemento.'));
    }
  }

  if (!parsedEpochId) return <ErrorAlert message="Epoca non valida." />;
  if (loading) return <Loading />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;
  const [epoch, events, media] = data;

  return (
    <DetailShell title={epoch.name} entityType="epoch" entityId={epoch.id} media={media} onMediaChanged={reload} onDelete={remove}>
      {deleteError && <ErrorAlert message={deleteError} />}
      <InfoGrid items={[['Rarità', String(epoch.rarity)], ['Eventi collegati', String(events.length)]]} />
      <Description text={epoch.description} />
      <EventListSection title="Eventi in questa epoca" events={events} />
    </DetailShell>
  );
}

function EventDetail() {
  const parsedEventId = parseRouteId(useParams().id);
  const eventId = parsedEventId ?? 0;
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(
    () => (parsedEventId ? Promise.all([api.event(eventId), api.eventParticipants(eventId), api.media(eventId)]) : Promise.resolve(null)),
    [eventId, parsedEventId],
  );

  async function remove() {
    if (!window.confirm('Eliminare definitivamente questo evento?')) return;
    await api.deleteEvent(eventId);
    navigate('/events');
  }

  if (!parsedEventId) return <ErrorAlert message="Evento non valido." />;
  if (loading) return <Loading />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;
  const [event, participants, media] = data;

  return (
    <DetailShell title={event.title} entityType="event" entityId={event.id} media={media} onMediaChanged={reload} onDelete={remove}>
      <InfoGrid
        items={[
          ['Data', formatDate(event)],
          ['Luogo', event.place ? event.place.name : 'Non indicato'],
          ['Epoca', event.epoch ? event.epoch.name : 'Non indicata'],
          ['Rarità', String(event.rarity)],
        ]}
      />
      <div className="d-flex gap-2 flex-wrap mb-4">
        {event.place && <Link className="btn btn-outline-secondary btn-sm" to={`/places/${event.place.id}`}>Apri luogo</Link>}
        {event.epoch && <Link className="btn btn-outline-secondary btn-sm" to={`/epochs/${event.epoch.id}`}>Apri epoca</Link>}
      </div>
      <Description text={event.description} />
      <EventParticipantsEditor eventId={event.id} initialParticipants={participants} />
    </DetailShell>
  );
}

export function DetailShell({
  title,
  entityType,
  entityId,
  media,
  onMediaChanged,
  onDelete,
  children,
}: {
  title: string;
  entityType: EntityType;
  entityId: number;
  media: MediaAsset[];
  onMediaChanged: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const [mediaError, setMediaError] = useState<string | null>(null);

  return (
    <section>
      <div className="detail-header mb-4">
        <div className="detail-heading min-w-0">
          <Link className="text-decoration-none small" to={entityPaths[entityType]}>
            <i className="bi bi-arrow-left me-1" />
            {entityPluralLabels[entityType]}
          </Link>
          <h1 className="h2 mt-2 mb-1">{title}</h1>
          <p className="text-secondary mb-3">{entityLabels[entityType]} #{entityId}</p>
          <div className="btn-group detail-actions">
            <Link className="btn btn-outline-primary" to={`${detailPath(entityType, entityId)}/edit`}>
              <i className="bi bi-pencil me-2" />
              Modifica
            </Link>
            <button className="btn btn-outline-danger" type="button" onClick={onDelete}>
              <i className="bi bi-trash me-2" />
              Elimina
            </button>
          </div>
        </div>
        <MediaSection
          pullableId={entityId}
          initialMedia={media}
          onChanged={onMediaChanged}
          onError={setMediaError}
        />
      </div>
      {mediaError && <div className="mb-4"><ErrorAlert message={mediaError} /></div>}
      <div className="detail-stack">{children}</div>
    </section>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]>; }) {
  return (
    <section className="border rounded bg-white p-4">
      <div className="row g-3">
        {items.map(([label, value]) => (
          <div className="col-sm-6 col-lg-3" key={label}>
            <div className="small text-secondary">{label}</div>
            <div className="fw-semibold">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Description({ text }: { text?: string | null; }) {
  return (
    <section className="border rounded bg-white p-4">
      <h2 className="h5">Descrizione</h2>
      <p className="mb-0 text-preline">{text || 'Nessuna descrizione.'}</p>
    </section>
  );
}

export function MediaSection({
  pullableId,
  initialMedia,
  onChanged,
  onError,
}: {
  pullableId: number;
  initialMedia: MediaAsset[];
  onChanged: () => void;
  onError?: (message: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const displayedIndex = Math.min(activeIndex, Math.max(initialMedia.length - 1, 0));

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(initialMedia.length - 1, 0)));
  }, [initialMedia.length]);

  useEffect(() => {
    onError?.(error);
  }, [error, onError]);

  useEffect(() => () => onError?.(null), [onError]);

  async function uploadSelected(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selectedFile = input.files?.[0];
    if (!selectedFile || uploading) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadMedia(selectedFile, pullableId);
      onChanged();
    } catch (err) {
      setError(formatError(err, 'Non è stato possibile caricare l’immagine.'));
    } finally {
      input.value = '';
      setUploading(false);
    }
  }

  async function remove(asset: MediaAsset) {
    if (!window.confirm('Eliminare definitivamente questa immagine?')) return;
    setDeletingId(asset.id);
    setError(null);
    try {
      await api.deleteMedia(asset.id);
      onChanged();
    } catch (err) {
      setError(formatError(err, 'Non è stato possibile eliminare l’immagine.'));
    } finally {
      setDeletingId(null);
    }
  }

  function showPrevious() {
    setActiveIndex((current) => (current - 1 + initialMedia.length) % initialMedia.length);
  }

  function showNext() {
    setActiveIndex((current) => (current + 1) % initialMedia.length);
  }

  return (
    <div className="media-gallery">
      <input
        className="visually-hidden"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        aria-label="Seleziona immagine"
        disabled={uploading}
        onChange={uploadSelected}
      />
      <div className="media-gallery-frame">
        {initialMedia.length === 0 ? (
          <div className="media-empty-state d-flex flex-column align-items-center justify-content-center text-secondary" aria-label="Nessuna immagine allegata">
            <i className="bi bi-image" aria-hidden="true" />
            <span className="small mt-2">Nessuna immagine</span>
          </div>
        ) : (
          <div className="carousel slide media-carousel h-100" aria-label="Immagini allegate">
            <div className="carousel-inner h-100">
              {initialMedia.map((asset, index) => (
                <div className={`carousel-item h-100${index === displayedIndex ? ' active' : ''}`} key={asset.id}>
                  <AuthenticatedMedia
                    asset={asset}
                    position={index + 1}
                    total={initialMedia.length}
                    deleting={deletingId === asset.id}
                    onDelete={() => remove(asset)}
                  />
                </div>
              ))}
            </div>
            {initialMedia.length > 1 && (
              <>
                <button className="carousel-control-prev media-carousel-control" type="button" onClick={showPrevious} aria-label="Immagine precedente">
                  <span className="carousel-control-prev-icon" aria-hidden="true" />
                </button>
                <button className="carousel-control-next media-carousel-control" type="button" onClick={showNext} aria-label="Immagine successiva">
                  <span className="carousel-control-next-icon" aria-hidden="true" />
                </button>
                <div className="carousel-indicators media-carousel-indicators">
                  {initialMedia.map((asset, index) => (
                    <button
                      className={index === displayedIndex ? 'active' : ''}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      aria-current={index === displayedIndex ? 'true' : undefined}
                      aria-label={`Mostra immagine ${index + 1}`}
                      key={asset.id}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <button
          className="btn btn-light media-gallery-action media-gallery-upload"
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          aria-label={uploading ? 'Caricamento immagine' : 'Carica immagine'}
          title={uploading ? 'Caricamento immagine' : 'Carica immagine'}
        >
          {uploading ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="bi bi-upload" aria-hidden="true" />}
        </button>
      </div>
      {!onError && error && <div className="mt-2"><ErrorAlert message={error} /></div>}
    </div>
  );
}

export function AuthenticatedMedia({
  asset,
  position = 1,
  total = 1,
  deleting = false,
  onDelete,
}: {
  asset: MediaAsset;
  position?: number;
  total?: number;
  deleting?: boolean;
  onDelete?: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setError(false);

    api
      .mediaBlob(asset.id)
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [asset.id]);

  return (
    <div className="media-slide h-100">
      <div className="media-carousel-frame d-flex align-items-center justify-content-center h-100">
        {error && <span className="text-secondary">Immagine non disponibile</span>}
        {!error && !objectUrl && (
          <div className="placeholder-glow" aria-label={`Caricamento immagine ${position} di ${total}`}>
            <span className="placeholder col-8" />
          </div>
        )}
        {objectUrl && <img src={objectUrl} alt={`Immagine ${position} di ${total}`} />}
      </div>
      <div className="media-image-actions d-flex gap-2" role="group" aria-label={`Azioni immagine ${position} di ${total}`}>
        {objectUrl ? (
          <a className="btn btn-light media-gallery-action" href={objectUrl} target="_blank" rel="noreferrer" aria-label={`Apri immagine ${position} di ${total} a dimensione intera`} title="Apri a dimensione intera">
            <i className="bi bi-arrows-fullscreen" aria-hidden="true" />
          </a>
        ) : (
          <button className="btn btn-light media-gallery-action" type="button" disabled aria-label="Immagine non ancora disponibile">
            <i className="bi bi-arrows-fullscreen" aria-hidden="true" />
          </button>
        )}
        {onDelete && (
          <button className="btn btn-light text-danger media-gallery-action" type="button" onClick={onDelete} disabled={deleting} aria-label={`Elimina immagine ${position} di ${total}`} title="Elimina immagine">
            {deleting ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="bi bi-trash" aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}

function PersonPlacesEditor({ personId, initialLinks }: { personId: number; initialLinks: PersonPlace[]; }) {
  const { data: places, loading, error } = useAsync(api.places, []);
  const [rows, setRows] = useState(() => initialLinks.map((link) => ({ place_id: String(link.place_id), motivation: link.motivation ?? '' })));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRows(initialLinks.map((link) => ({ place_id: String(link.place_id), motivation: link.motivation ?? '' })));
  }, [initialLinks]);

  async function save() {
    const ids = rows.map((row) => row.place_id).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      setSaveError('Ogni luogo può comparire una sola volta.');
      return;
    }
    setSaveError(null);
    setSaved(false);
    try {
      await api.replacePersonPlaces(personId, rows.filter((row) => row.place_id).map((row) => ({ place_id: Number(row.place_id), motivation: cleanOptional(row.motivation) })));
      setSaved(true);
    } catch (err) {
      setSaveError(formatError(err, 'Non è stato possibile salvare i collegamenti.'));
    }
  }

  return (
    <section className="border rounded bg-white p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">Luoghi collegati</h2>
        <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setRows([...rows, { place_id: '', motivation: '' }])}>
          <i className="bi bi-plus-lg me-1" />
          Aggiungi
        </button>
      </div>
      {loading && <Loading />}
      {error && <ErrorAlert message={error} />}
      {saveError && <ErrorAlert message={saveError} />}
      {saved && <div className="alert alert-success">Collegamenti salvati.</div>}
      {places && (
        <>
          {rows.length === 0 && <p className="text-secondary">Nessun luogo collegato.</p>}
          {rows.map((row, index) => (
            <div className="row g-2 align-items-end mb-2" key={index}>
              <div className="col-md-5">
                <label className="form-label">Luogo</label>
                <select className="form-select" value={row.place_id} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, place_id: event.target.value } : item))}>
                  <option value="">Scegli luogo</option>
                  {places.map((place) => <option value={place.id} key={place.id}>{place.name}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Motivazione</label>
                <input className="form-control" value={row.motivation} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, motivation: event.target.value } : item))} />
              </div>
              <div className="col-md-1">
                <button className="btn btn-outline-danger w-100" type="button" onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label="Rimuovi luogo">
                  <i className="bi bi-x-lg" />
                </button>
              </div>
            </div>
          ))}
          <button className="btn btn-primary mt-2" type="button" onClick={save}>Salva collegamenti</button>
        </>
      )}
    </section>
  );
}

export function EventParticipantsEditor({ eventId, initialParticipants }: { eventId: number; initialParticipants: EventParticipant[]; }) {
  const { data: people, loading, error } = useAsync(api.people, []);
  const [rows, setRows] = useState(() => initialParticipants.map((link) => ({ person_id: String(link.person_id), role: link.role ?? '', motivation: link.motivation ?? '' })));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRows(initialParticipants.map((link) => ({ person_id: String(link.person_id), role: link.role ?? '', motivation: link.motivation ?? '' })));
  }, [initialParticipants]);

  async function save() {
    const ids = rows.map((row) => row.person_id).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      setSaveError('Ogni persona può comparire una sola volta.');
      return;
    }
    setSaveError(null);
    setSaved(false);
    try {
      await api.replaceEventParticipants(eventId, rows.filter((row) => row.person_id).map((row) => ({ person_id: Number(row.person_id), role: cleanOptional(row.role), motivation: cleanOptional(row.motivation) })));
      setSaved(true);
    } catch (err) {
      setSaveError(formatError(err, 'Non è stato possibile salvare i partecipanti.'));
    }
  }

  return (
    <section className="border rounded bg-white p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">Partecipanti</h2>
        <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setRows([...rows, { person_id: '', role: '', motivation: '' }])}>
          <i className="bi bi-plus-lg me-1" />
          Aggiungi
        </button>
      </div>
      {loading && <Loading />}
      {error && <ErrorAlert message={error} />}
      {saveError && <ErrorAlert message={saveError} />}
      {saved && <div className="alert alert-success">Partecipanti salvati.</div>}
      {people && (
        <>
          {rows.length === 0 && <p className="text-secondary">Nessun partecipante collegato.</p>}
          {rows.map((row, index) => (
            <div className="row g-2 align-items-end mb-2" key={index}>
              <div className="col-md-4">
                <label className="form-label">Persona</label>
                <select className="form-select" value={row.person_id} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, person_id: event.target.value } : item))}>
                  <option value="">Scegli persona</option>
                  {people.map((person) => <option value={person.id} key={person.id}>{person.alias}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor={`participant-role-${index}`}>Ruolo</label>
                <input id={`participant-role-${index}`} className="form-control" value={row.role} maxLength={255} placeholder="Es. Guida" onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Motivazione</label>
                <input className="form-control" value={row.motivation} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, motivation: event.target.value } : item))} />
              </div>
              <div className="col-md-1">
                <button className="btn btn-outline-danger w-100" type="button" onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label="Rimuovi partecipante">
                  <i className="bi bi-x-lg" />
                </button>
              </div>
            </div>
          ))}
          <button className="btn btn-primary mt-2" type="button" onClick={save}>Salva partecipanti</button>
        </>
      )}
    </section>
  );
}

export function LinkedEvents({ events }: { events: PersonEvent[]; }) {
  return (
    <section className="border rounded bg-white p-4">
      <h2 className="h5">Eventi collegati</h2>
      {events.length === 0 ? <p className="text-secondary mb-0">Nessun evento collegato.</p> : (
        <div className="list-group list-group-flush">
          {events.map((link) => link.event && (
            <Link className="list-group-item list-group-item-action px-0" to={`/events/${link.event.id}`} key={link.event_id}>
              <div className="d-flex justify-content-between gap-3">
                <span>{link.event.title}</span>
                {link.role && <span className="badge text-bg-light">{link.role}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function LinkedPeople({ links }: { links: PlacePerson[]; }) {
  return (
    <section className="border rounded bg-white p-4">
      <h2 className="h5">Persone collegate</h2>
      {links.length === 0 ? <p className="text-secondary mb-0">Nessuna persona collegata.</p> : (
        <div className="list-group list-group-flush">
          {links.map((link) => link.person && (
            <Link className="list-group-item list-group-item-action px-0" to={`/people/${link.person.id}`} key={link.person_id}>
              <span className="fw-semibold">{link.person.alias}</span>
              {link.motivation && <span className="text-secondary ms-2">{link.motivation}</span>}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function EventListSection({ title, events }: { title: string; events: Event[]; }) {
  return (
    <section className="border rounded bg-white p-4">
      <h2 className="h5">{title}</h2>
      {events.length === 0 ? <p className="text-secondary mb-0">Nessun evento collegato.</p> : (
        <div className="list-group list-group-flush">
          {events.map((event) => (
            <Link className="list-group-item list-group-item-action px-0" to={`/events/${event.id}`} key={event.id}>
              <div className="d-flex justify-content-between gap-3">
                <span>{event.title}</span>
                <span className="text-secondary small">{formatDate(event)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await api.search(query.trim()));
    } catch (err) {
      setError(formatError(err, 'Non è stato possibile completare la ricerca.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h1 className="h2 mb-4">Cerca</h1>
      <form className="input-group mb-4" onSubmit={submit}>
        <input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca persone, luoghi, epoche, eventi" />
        <button className="btn btn-primary" type="submit">
          <i className="bi bi-search me-2" />
          Cerca
        </button>
      </form>
      {loading && <Loading />}
      {error && <ErrorAlert message={error} />}
      {!loading && results.length === 0 && <EmptyState>Nessun risultato da mostrare.</EmptyState>}
      <div className="list-group">
        {results.map((result) => (
          <Link className="list-group-item list-group-item-action" to={detailPath(result.entity_type, result.id)} key={`${result.entity_type}-${result.id}`}>
            <span className="badge text-bg-light me-2">{entityLabels[result.entity_type]}</span>
            <span className="fw-semibold">{result.title}</span>
            {result.subtitle && <span className="text-secondary ms-2">{result.subtitle}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}

function PullsPage() {
  const [entityType, setEntityType] = useState<EntityType | ''>('');
  const [result, setResult] = useState<PullResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function pull(mode: 'random' | 'daily') {
    setLoading(true);
    setError(null);
    try {
      const selected = entityType || undefined;
      setResult(mode === 'daily' ? await api.dailyPull(selected) : await api.randomPull(selected));
    } catch (err) {
      setError(formatError(err, 'Non è stato possibile completare l’estrazione.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto pulls-page">
      <h1 className="h2 mb-4">Estrazioni</h1>
      <div className="border rounded bg-white p-4">
        <div className="row g-3 align-items-end">
          <div className="col-md-6">
            <label className="form-label" htmlFor="pull-type">Tipo</label>
            <select className="form-select" id="pull-type" value={entityType} onChange={(event) => setEntityType(event.target.value as EntityType | '')}>
              <option value="">Tutto</option>
              {Object.entries(entityPluralLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </div>
          <div className="col-md-6 d-flex gap-2">
            <button className="btn btn-primary flex-fill" type="button" disabled={loading} onClick={() => pull('random')}>
              <i className="bi bi-shuffle me-2" />
              Estrai
            </button>
            <button className="btn btn-outline-primary flex-fill" type="button" disabled={loading} onClick={() => pull('daily')}>
              <i className="bi bi-sun me-2" />
              Del giorno
            </button>
          </div>
        </div>
        {error && <div className="mt-3"><ErrorAlert message={error} /></div>}
        {result && (
          <div className="pull-result border rounded p-4 mt-4">
            <p className="text-secondary mb-1">{entityLabels[result.entity_type]} · rarità {result.rarity}</p>
            <Link className="h3 text-decoration-none" to={detailPath(result.entity_type, result.id)}>{result.title}</Link>
          </div>
        )}
      </div>
    </section>
  );
}

export default App;
