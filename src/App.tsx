import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DependencyList, type FormEvent, type ReactNode } from 'react';
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
import { AdminActivityPage, AdminDashboard, AdminUserCreatePage, AdminUserPage } from './AdminPages';
import { clearAccessToken, getAccessToken, subscribeToSessionLoss } from './auth';
import { LoadingIndicator } from './LoadingIndicator';
import { PasswordForm } from './PasswordForm';
import { PasswordInput } from './PasswordInput';
import {
  epochEnd,
  epochRangeError,
  epochStart,
  eventEpochConflict,
  formatEpochRange,
  formatPartialDate,
  partialDateError,
  type PartialDateValue,
} from './partialDates';
import {
  applyColorMode,
  getPreferredColorMode,
  getStoredColorMode,
  storeColorMode,
  subscribeToSystemColorMode,
  type ColorMode,
} from './theme';
import { useMaintenance } from './useMaintenance';
import type {
  Connotation,
  EntityType,
  Epoch,
  Event,
  EventParticipant,
  Group,
  GroupSummary,
  MediaAsset,
  MaintenanceStatus,
  Person,
  PersonEvent,
  PersonPlace,
  Place,
  PlacePerson,
  ProfileActivity,
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
  group: 'Cerchia',
};

const entityPluralLabels: Record<EntityType, string> = {
  person: 'Persone',
  place: 'Luoghi',
  epoch: 'Epoche',
  event: 'Eventi',
  group: 'Cerchie',
};

const entityPaths: Record<EntityType, string> = {
  person: '/people',
  place: '/places',
  epoch: '/epochs',
  event: '/events',
  group: '/groups',
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

const connotationBadgeClasses: Record<Connotation, string> = {
  positive: 'text-bg-success',
  negative: 'text-bg-danger',
  neutral: 'text-bg-light',
  unknown: 'text-bg-secondary',
};

const defaultMaintenanceMessage = 'Wiki Parchino sarà temporaneamente non disponibile per manutenzione.';

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

async function loadEntityList<T extends { id: number }>(loader: () => Promise<T[]>) {
  const items = await loader();
  let previewAssets: MediaAsset[] = [];
  if (items.length > 0) {
    try {
      previewAssets = await api.mediaPreviews(items.map((item) => item.id));
    } catch {
      // List content remains usable when optional previews are unavailable.
    }
  }
  return {
    items,
    previews: new Map(previewAssets.map((asset) => [asset.pullable_id, asset])),
  };
}

function ErrorAlert({ message }: { message: string; }) {
  return (
    <div className="alert alert-danger" role="alert">
      {message}
    </div>
  );
}

function EmptyState({ children }: { children: string; }) {
  return <div className="border rounded p-4 text-center text-secondary bg-body">{children}</div>;
}

function RequiredMark() {
  return <span className="text-danger ms-1">*</span>;
}

function formatMaintenanceCountdown(milliseconds: number | null): string {
  if (milliseconds === null) return '';
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min ${String(remainingSeconds).padStart(2, '0')} s`;
  return `${minutes} min ${String(remainingSeconds).padStart(2, '0')} s`;
}

function App() {
  const { colorMode, toggleColorMode } = useColorMode();
  return (
    <HashRouter>
      <AppRoot colorMode={colorMode} onToggleColorMode={toggleColorMode} />
    </HashRouter>
  );
}

function useColorMode() {
  const [colorMode, setColorMode] = useState<ColorMode>(() => getPreferredColorMode());

  useEffect(() => {
    applyColorMode(colorMode);
  }, [colorMode]);

  useEffect(() => subscribeToSystemColorMode((systemMode) => {
    if (getStoredColorMode() === null) setColorMode(systemMode);
  }), []);

  const toggleColorMode = useCallback(() => {
    setColorMode((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      storeColorMode(next);
      return next;
    });
  }, []);

  return { colorMode, toggleColorMode };
}

function AppRoot({
  colorMode,
  onToggleColorMode,
}: {
  colorMode: ColorMode;
  onToggleColorMode: () => void;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const maintenance = useMaintenance();

  useEffect(() => {
    return subscribeToSessionLoss(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!maintenance.initialized || authChecked || maintenance.status?.state === 'active') return;
    if (maintenance.status === null && maintenance.unavailable) return;
    if (!getAccessToken()) {
      setAuthChecked(true);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, [authChecked, maintenance.initialized, maintenance.status, maintenance.unavailable]);

  useEffect(() => {
    if (maintenance.status?.state !== 'active') return;
    clearAccessToken();
    setUser(null);
    setAuthChecked(true);
  }, [maintenance.status?.state]);

  if (!maintenance.initialized || (
    maintenance.status?.state !== 'active'
    && !(maintenance.status === null && maintenance.unavailable)
    && !authChecked
  )) {
    return (
      <main className="container py-5">
        <LoadingIndicator variant="page" appearance="logo" />
      </main>
    );
  }

  if (maintenance.status?.state === 'active') {
    return (
      <MaintenancePage
        colorMode={colorMode}
        message={maintenance.status.message}
        offline={maintenance.unavailable}
        onRefresh={() => void maintenance.refresh()}
        onToggleColorMode={onToggleColorMode}
      />
    );
  }

  if (maintenance.status === null && maintenance.unavailable) {
    return (
      <ServerUnavailablePage
        colorMode={colorMode}
        onRefresh={() => void maintenance.refresh()}
        onToggleColorMode={onToggleColorMode}
      />
    );
  }

  if (!user) {
    return (
      <LoginPage
        colorMode={colorMode}
        maintenance={maintenance.status}
        remainingMilliseconds={maintenance.remainingMilliseconds}
        onToggleColorMode={onToggleColorMode}
        onLogin={setUser}
      />
    );
  }

  return (
    <AuthenticatedApp
      colorMode={colorMode}
      maintenance={maintenance.status}
      remainingMilliseconds={maintenance.remainingMilliseconds}
      user={user}
      onToggleColorMode={onToggleColorMode}
      onUserChange={setUser}
      onLogout={() => setUser(null)}
    />
  );
}

function LoginPage({
  colorMode,
  maintenance,
  remainingMilliseconds,
  onToggleColorMode,
  onLogin,
}: {
  colorMode: ColorMode;
  maintenance: MaintenanceStatus | null;
  remainingMilliseconds: number | null;
  onToggleColorMode: () => void;
  onLogin: (user: User) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const season = getSeason(new Date());
  const seasonData = seasonConfig[season];
  const loginDisabled = maintenance?.state === 'scheduled';

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
            <div className="card login-card shadow-lg border-0 overflow-hidden position-relative">
              <ThemeToggleButton
                className="login-theme-toggle"
                colorMode={colorMode}
                onToggle={onToggleColorMode}
              />
              <div className="row g-0 align-items-stretch">
                <div className="col-md-6 login-brand-panel d-flex align-items-center justify-content-center p-4">
                  <img className="login-logo img-fluid" src={seasonData.logo} alt="Wiki Parchino" />
                </div>
                <div className="col-md-6">
                  <form className="card-body p-4 p-lg-5" onSubmit={submit}>
                    <p className="text-uppercase small fw-semibold text-secondary mb-2">{seasonData.label}</p>
                    <h1 className="h3 mb-3">Accedi a Wiki Parchino</h1>
                    <p className="text-secondary">Un'estesa wiki della lore del Parchino.</p>
                    {loginDisabled && (
                      <MaintenanceWarning
                        className="mb-3"
                        message={maintenance.message}
                        remainingMilliseconds={remainingMilliseconds}
                      />
                    )}
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
                        disabled={loginDisabled}
                        required
                      />
                    </div>
                    <div className="mb-4">
                      <label className="form-label" htmlFor="password">
                        Password
                        <RequiredMark />
                      </label>
                      <PasswordInput
                        autoComplete="current-password"
                        disabled={loginDisabled}
                        id="password"
                        value={password}
                        onChange={setPassword}
                        required
                      />
                    </div>
                    <button className="btn btn-primary w-100" type="submit" disabled={submitting || loginDisabled}>
                      {submitting ? (
                        <LoadingIndicator variant="inline" appearance="bootstrap" label="Accesso in corso" />
                      ) : (
                        <><i className="bi bi-box-arrow-in-right me-2" />Entra</>
                      )}
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

function AuthenticatedApp({
  colorMode,
  maintenance,
  remainingMilliseconds,
  user,
  onToggleColorMode,
  onUserChange,
  onLogout,
}: {
  colorMode: ColorMode;
  maintenance: MaintenanceStatus | null;
  remainingMilliseconds: number | null;
  user: User;
  onToggleColorMode: () => void;
  onUserChange: (user: User) => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function closeOutside(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setAccountMenuOpen(false);
      accountMenuRef.current?.querySelector<HTMLButtonElement>('.account-menu-toggle')?.focus();
    }
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);

  function closeNavigation() {
    setOpen(false);
    setAccountMenuOpen(false);
  }

  async function logout() {
    closeNavigation();
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
            onClick={() => {
              setAccountMenuOpen(false);
              setOpen((value) => !value);
            }}
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className={`collapse navbar-collapse ${open ? 'show' : ''}`} id="main-navbar">
            <div className="navbar-nav me-auto">
              <NavItem to="/" label="Bacheca" icon="bi-grid-1x2" onClick={closeNavigation} end />
              <NavItem to="/people" label="Persone" icon="bi-people" onClick={closeNavigation} />
              <NavItem to="/places" label="Luoghi" icon="bi-geo-alt" onClick={closeNavigation} />
              <NavItem to="/epochs" label="Epoche" icon="bi-hourglass-split" onClick={closeNavigation} />
              <NavItem to="/groups" label="Cerchie" icon="bi-diagram-3" onClick={closeNavigation} />
              <NavItem to="/events" label="Eventi" icon="bi-calendar-event" onClick={closeNavigation} />
              <NavItem to="/search" label="Cerca" icon="bi-search" onClick={closeNavigation} />
              <NavItem to="/pulls" label="Estrazioni" icon="bi-shuffle" onClick={closeNavigation} />
            </div>
            <div className="account-nav d-flex align-items-center">
              <div className="dropdown account-dropdown" ref={accountMenuRef}>
                <button
                  className="btn btn-outline-secondary btn-sm dropdown-toggle account-menu-toggle d-inline-flex align-items-center gap-2"
                  id="account-menu-toggle"
                  type="button"
                  aria-controls="account-menu"
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="true"
                  onClick={() => setAccountMenuOpen((value) => !value)}
                >
                  <i className="bi bi-person-circle" aria-hidden="true" />
                  <span className="text-truncate">{user.display_name}</span>
                </button>
                <ul
                  className={`dropdown-menu dropdown-menu-end${accountMenuOpen ? ' show' : ''}`}
                  id="account-menu"
                  aria-labelledby="account-menu-toggle"
                >
                  <li>
                    <NavLink className="dropdown-item d-flex align-items-center gap-2" to="/profile" onClick={closeNavigation}>
                      <i className="bi bi-person" aria-hidden="true" />
                      Profilo
                    </NavLink>
                  </li>
                  {user.is_admin && (
                    <li>
                      <NavLink className="dropdown-item d-flex align-items-center gap-2" to="/admin" onClick={closeNavigation}>
                        <i className="bi bi-shield-lock" aria-hidden="true" />
                        Amministrazione
                      </NavLink>
                    </li>
                  )}
                  <li><hr className="dropdown-divider" /></li>
                  <li>
                    <ThemeToggleButton
                      className="dropdown-item d-flex align-items-center gap-2"
                      colorMode={colorMode}
                      onToggle={() => {
                        onToggleColorMode();
                        setAccountMenuOpen(false);
                      }}
                      showLabel
                    />
                  </li>
                  <li><hr className="dropdown-divider" /></li>
                  <li>
                    <button className="dropdown-item d-flex align-items-center gap-2 text-danger" type="button" onClick={logout}>
                      <i className="bi bi-box-arrow-right" aria-hidden="true" />
                      Esci
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </nav>
      {maintenance?.state === 'scheduled' && (
        <div className="container-fluid app-container pb-0">
          <MaintenanceWarning
            message={maintenance.message}
            remainingMilliseconds={remainingMilliseconds}
          />
        </div>
      )}
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
          <Route path="/groups" element={<GroupsList />} />
          <Route path="/groups/new" element={<GroupForm mode="create" />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/groups/:id/edit" element={<GroupForm mode="edit" />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/pulls" element={<PullsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminGuard user={user}><AdminDashboard /></AdminGuard>} />
          <Route path="/admin/users/new" element={<AdminGuard user={user}><AdminUserCreatePage /></AdminGuard>} />
          <Route
            path="/admin/users/:id"
            element={<AdminGuard user={user}><AdminUserPage currentUser={user} onCurrentUserChange={onUserChange} /></AdminGuard>}
          />
          <Route path="/admin/activity" element={<AdminGuard user={user}><AdminActivityPage /></AdminGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

function MaintenanceWarning({
  className = '',
  message,
  remainingMilliseconds,
}: {
  className?: string;
  message: string | null;
  remainingMilliseconds: number | null;
}) {
  return (
    <div
      className={`alert alert-warning d-flex align-items-start gap-3 maintenance-warning ${className}`.trim()}
      role="alert"
    >
      <i className="bi bi-tools fs-4" aria-hidden="true" />
      <div>
        <strong className="d-block">Manutenzione programmata</strong>
        <span>{message || defaultMaintenanceMessage}</span>
        <span className="d-block fw-semibold maintenance-countdown" aria-live="polite">
          Il servizio non sarà disponibile tra {formatMaintenanceCountdown(remainingMilliseconds)}.
        </span>
        <span className="d-block small mt-1">Non è possibile avviare nuove sessioni.</span>
      </div>
    </div>
  );
}

function MaintenancePage({
  colorMode,
  message,
  offline,
  onRefresh,
  onToggleColorMode,
}: {
  colorMode: ColorMode;
  message: string | null;
  offline: boolean;
  onRefresh: () => void;
  onToggleColorMode: () => void;
}) {
  return (
    <main className="maintenance-page d-flex align-items-center justify-content-center p-3">
      <section className="maintenance-panel text-center">
        <div className="d-flex justify-content-end mb-4">
          <ThemeToggleButton
            className="btn btn-outline-secondary maintenance-theme-toggle"
            colorMode={colorMode}
            onToggle={onToggleColorMode}
          />
        </div>
        <i className="bi bi-tools maintenance-icon text-warning" aria-hidden="true" />
        <h1 className="h2 mt-3">Wiki Parchino è in manutenzione</h1>
        <p className="text-secondary mb-2">{message || defaultMaintenanceMessage}</p>
        <p className="small text-secondary">
          {offline
            ? 'Il server non è al momento raggiungibile. Il controllo verrà ripetuto automaticamente.'
            : 'Questa pagina controllerà automaticamente quando il servizio tornerà disponibile.'}
        </p>
        <button className="btn btn-outline-primary mt-3" type="button" onClick={onRefresh}>
          <i className="bi bi-arrow-clockwise me-2" aria-hidden="true" />
          Controlla ora
        </button>
      </section>
    </main>
  );
}

function ServerUnavailablePage({
  colorMode,
  onRefresh,
  onToggleColorMode,
}: {
  colorMode: ColorMode;
  onRefresh: () => void;
  onToggleColorMode: () => void;
}) {
  return (
    <main className="maintenance-page d-flex align-items-center justify-content-center p-3">
      <section className="maintenance-panel text-center">
        <div className="d-flex justify-content-end mb-4">
          <ThemeToggleButton
            className="btn btn-outline-secondary maintenance-theme-toggle"
            colorMode={colorMode}
            onToggle={onToggleColorMode}
          />
        </div>
        <i className="bi bi-wifi-off maintenance-icon text-secondary" aria-hidden="true" />
        <h1 className="h2 mt-3">Server non disponibile</h1>
        <p className="text-secondary">
          Non è possibile verificare lo stato di Wiki Parchino. Riprova tra poco.
        </p>
        <button className="btn btn-primary mt-3" type="button" onClick={onRefresh}>
          <i className="bi bi-arrow-clockwise me-2" aria-hidden="true" />
          Riprova
        </button>
      </section>
    </main>
  );
}

function ThemeToggleButton({
  colorMode,
  onToggle,
  className,
  showLabel = false,
}: {
  colorMode: ColorMode;
  onToggle: () => void;
  className: string;
  showLabel?: boolean;
}) {
  const switchesToDark = colorMode === 'light';
  const label = switchesToDark ? 'Attiva tema scuro' : 'Attiva tema chiaro';
  return (
    <button className={className} type="button" title={label} aria-label={label} onClick={onToggle}>
      <i className={`bi ${switchesToDark ? 'bi-moon-stars' : 'bi-sun'}`} aria-hidden="true" />
      {showLabel && <span>{switchesToDark ? 'Tema scuro' : 'Tema chiaro'}</span>}
    </button>
  );
}

function AdminGuard({ user, children }: { user: User; children: ReactNode; }) {
  if (user.is_admin) return children;
  return (
    <section className="py-4">
      <div className="alert alert-danger" role="alert">
        <h1 className="h4">Accesso negato</h1>
        <p className="mb-3">Questa sezione è riservata agli amministratori.</p>
        <Link className="btn btn-outline-danger" to="/">Torna alla bacheca</Link>
      </div>
    </section>
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

type EntityCardBadge = { label: string; className: string; };

type DashboardEntity = {
  entityType: EntityType;
  id: number;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  badge?: EntityCardBadge;
  createdAt: string;
};

function dashboardEntities(
  people: Person[],
  places: Place[],
  epochs: Epoch[],
  events: Event[],
  groups: GroupSummary[],
): DashboardEntity[] {
  return [
    ...people.map((person) => ({
      entityType: 'person' as const,
      id: person.id,
      title: person.alias,
      subtitle: [person.name, person.surname].filter(Boolean).join(' ') || null,
      description: person.description,
      badge: {
        label: connotationLabels[person.connotation],
        className: connotationBadgeClasses[person.connotation],
      },
      createdAt: person.created_at,
    })),
    ...places.map((place) => ({
      entityType: 'place' as const,
      id: place.id,
      title: place.name,
      subtitle: place.address,
      description: place.description,
      createdAt: place.created_at,
    })),
    ...epochs.map((epoch) => ({
      entityType: 'epoch' as const,
      id: epoch.id,
      title: epoch.name,
      subtitle: formatEpochRange(epoch),
      description: epoch.description,
      createdAt: epoch.created_at,
    })),
    ...events.map((event) => ({
      entityType: 'event' as const,
      id: event.id,
      title: event.title,
      subtitle: [event.place?.name, event.epoch?.name, formatPartialDate(event)].filter(Boolean).join(' · '),
      description: event.description,
      createdAt: event.created_at,
    })),
    ...groups.map((group) => ({
      entityType: 'group' as const,
      id: group.id,
      title: group.name,
      subtitle: groupCountSubtitle(group),
      description: group.description,
      createdAt: group.created_at,
    })),
  ];
}

async function loadDashboard() {
  const [people, places, epochs, events, groups, daily] = await Promise.all([
    api.people(),
    api.places(),
    api.epochs(),
    api.events(),
    api.groups(),
    api.dailyPull(),
  ]);
  let dailyPreview: MediaAsset | undefined;
  try {
    [dailyPreview] = await api.mediaPreviews([daily.id]);
  } catch {
    // The dashboard remains usable when the optional daily preview is unavailable.
  }
  return { people, places, epochs, events, groups, daily, dailyPreview };
}

function Dashboard() {
  const { data, loading, error } = useAsync(loadDashboard, []);

  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  const { people, places, epochs, events, groups, daily, dailyPreview } = data;
  const entities = dashboardEntities(people, places, epochs, events, groups);
  const dailyEntity = entities.find((entity) => (
    entity.entityType === daily.entity_type && entity.id === daily.id
  )) ?? {
    entityType: daily.entity_type,
    id: daily.id,
    title: daily.title,
    description: null,
    createdAt: '',
  };
  const recentEntities = [...entities]
    .sort((left, right) => (
      Date.parse(right.createdAt) - Date.parse(left.createdAt)
      || right.id - left.id
      || right.entityType.localeCompare(left.entityType)
    ))
    .slice(0, 5);

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
      <div className="row g-3 mb-4 dashboard-metric-grid">
        <MetricCard label="Persone" value={people.length} to="/people" icon="bi-people" />
        <MetricCard label="Luoghi" value={places.length} to="/places" icon="bi-geo-alt" />
        <MetricCard label="Epoche" value={epochs.length} to="/epochs" icon="bi-hourglass-split" />
        <MetricCard label="Eventi" value={events.length} to="/events" icon="bi-calendar-event" />
        <MetricCard label="Cerchie" value={groups.length} to="/groups" icon="bi-diagram-3" />
      </div>
      <div className="row g-4">
        <div className="col-lg-5">
          <section aria-labelledby="daily-entity-heading">
            <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
              <h2 className="h5 mb-0" id="daily-entity-heading">Elemento del giorno</h2>
              <span className="badge text-bg-light">Rarità {daily.rarity}</span>
            </div>
            <EntityCard
              entityType={dailyEntity.entityType}
              entityId={dailyEntity.id}
              title={dailyEntity.title}
              subtitle={dailyEntity.subtitle}
              description={dailyEntity.description}
              badge={dailyEntity.badge}
              preview={dailyPreview}
            />
          </section>
        </div>
        <div className="col-lg-7">
          <section className="border rounded bg-body p-4">
            <h2 className="h5 mb-3">Ultimi 5 elementi creati</h2>
            <div className="list-group list-group-flush">
              {recentEntities.map((entity) => (
                <Link className="list-group-item list-group-item-action px-0" to={detailPath(entity.entityType, entity.id)} key={`${entity.entityType}:${entity.id}`}>
                  <span className="d-flex justify-content-between align-items-start gap-3">
                    <span className="min-w-0">
                      <span className="fw-semibold d-block text-break">{entity.title}</span>
                      <span className="text-secondary small">{entityLabels[entity.entityType]}</span>
                    </span>
                    <time className="text-secondary small text-nowrap" dateTime={entity.createdAt}>{formatActivityDate(entity.createdAt)}</time>
                  </span>
                </Link>
              ))}
              {recentEntities.length === 0 && <span className="text-secondary py-3">Nessun elemento disponibile.</span>}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function formatActivityDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function ProfilePage() {
  const { data, loading, error } = useAsync(api.profile, []);

  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  return (
    <section>
      <div className="mb-4">
        <h1 className="h2 mb-1">Profilo</h1>
        <p className="text-secondary mb-0">Account, attività recenti e sicurezza.</p>
      </div>
      <div className="row g-4">
        <div className="col-lg-4">
          <section className="border rounded bg-body p-4 mb-4" aria-labelledby="account-heading">
            <h2 className="h5" id="account-heading">Account</h2>
            <dl className="mb-0">
              <dt className="small text-secondary fw-normal">Nome visualizzato</dt>
              <dd className="fw-semibold">{data.user.display_name}</dd>
              <dt className="small text-secondary fw-normal">Username</dt>
              <dd className="mb-0">@{data.user.username}</dd>
            </dl>
          </section>
          <PasswordForm
            idPrefix="profile"
            requireCurrentPassword
            onSubmit={({ currentPassword, newPassword }) => (
              api.changePassword(currentPassword ?? '', newPassword)
            )}
            successMessage="Password aggiornata. Le altre sessioni sono state disconnesse."
            badRequestMessage="La password attuale non è corretta."
          />
        </div>
        <div className="col-lg-8">
          <section className="border rounded bg-body p-4" aria-labelledby="activity-heading">
            <h2 className="h5 mb-3" id="activity-heading">Attività recenti</h2>
            {data.recent_activity.length === 0 ? (
              <div className="text-secondary py-3">Nessuna attività recente.</div>
            ) : (
              <div className="list-group list-group-flush">
                {data.recent_activity.map((activity: ProfileActivity, index) => (
                  <Link
                    className="list-group-item list-group-item-action px-0 d-flex justify-content-between align-items-start gap-3"
                    to={detailPath(activity.entity_type, activity.entity_id)}
                    key={`${activity.entity_type}:${activity.entity_id}:${activity.occurred_at}:${index}`}
                  >
                    <span className="min-w-0">
                      <span className="d-block fw-semibold text-break">{activity.title}</span>
                      <span className="small text-secondary">
                        {activity.action === 'created' ? 'Creato' : 'Modificato'} · {entityLabels[activity.entity_type]}
                      </span>
                    </span>
                    <time className="small text-secondary text-nowrap" dateTime={activity.occurred_at}>
                      {formatActivityDate(activity.occurred_at)}
                    </time>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, to, icon }: { label: string; value: number; to: string; icon: string; }) {
  return (
    <div className="col-12 col-sm-6 col-lg flex-grow-1 dashboard-metric-column">
      <Link className="metric-card border rounded bg-body p-3 text-decoration-none d-block h-100" to={to}>
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
  const { data, loading, error } = useAsync(() => loadEntityList(api.people), []);
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (data?.items ?? []).filter((person) =>
      [person.alias, person.name, person.surname, person.description].some((value) =>
        (value ?? '').toLowerCase().includes(term),
      ),
    );
  }, [data, filter]);

  return (
    <ListPage title="Persone" createTo="/people/new" filter={filter} onFilter={setFilter}>
      {loading && <LoadingIndicator variant="section" appearance="logo" />}
      {error && <ErrorAlert message={error} />}
      {!loading && filtered.length === 0 && <EmptyState>Nessuna persona trovata.</EmptyState>}
      <EntityList
        items={filtered}
        previews={data?.previews}
        entityType="person"
        titleFor={(person) => person.alias}
        subtitleFor={(person) => [person.name, person.surname].filter(Boolean).join(' ') || null}
        descriptionFor={(person) => person.description}
        badgeFor={(person) => ({
          label: connotationLabels[person.connotation],
          className: connotationBadgeClasses[person.connotation],
        })}
      />
    </ListPage>
  );
}

function PlacesList() {
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useAsync(() => loadEntityList(api.places), []);
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (data?.items ?? []).filter((place) =>
      [place.name, place.address, place.description].some((value) =>
        (value ?? '').toLowerCase().includes(term),
      ),
    );
  }, [data, filter]);

  return (
    <ListPage
      title="Luoghi"
      createTo="/places/new"
      filter={filter}
      filterPlaceholder="Filtra per nome, indirizzo o descrizione"
      onFilter={setFilter}
    >
      {loading && <LoadingIndicator variant="section" appearance="logo" />}
      {error && <ErrorAlert message={error} />}
      {!loading && filtered.length === 0 && <EmptyState>Nessun luogo trovato.</EmptyState>}
      <EntityList
        items={filtered}
        previews={data?.previews}
        entityType="place"
        titleFor={(place) => place.name}
        subtitleFor={(place) => place.address}
        descriptionFor={(place) => place.description}
      />
    </ListPage>
  );
}

function EpochsList() {
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useAsync(() => loadEntityList(api.epochs), []);
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (data?.items ?? []).filter((epoch) => [epoch.name, epoch.description].some((value) => (value ?? '').toLowerCase().includes(term)));
  }, [data, filter]);

  return (
    <ListPage title="Epoche" createTo="/epochs/new" filter={filter} onFilter={setFilter}>
      {loading && <LoadingIndicator variant="section" appearance="logo" />}
      {error && <ErrorAlert message={error} />}
      {!loading && filtered.length === 0 && <EmptyState>Nessuna epoca trovata.</EmptyState>}
      <EntityList
        items={filtered}
        previews={data?.previews}
        entityType="epoch"
        titleFor={(epoch) => epoch.name}
        subtitleFor={formatEpochRange}
        descriptionFor={(epoch) => epoch.description}
      />
    </ListPage>
  );
}

function EventsList() {
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useAsync(() => loadEntityList(api.events), []);
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (data?.items ?? []).filter((event) =>
      [event.title, event.description, event.place?.name, event.epoch?.name].some((value) => (value ?? '').toLowerCase().includes(term)),
    );
  }, [data, filter]);

  return (
    <ListPage title="Eventi" createTo="/events/new" filter={filter} onFilter={setFilter}>
      {loading && <LoadingIndicator variant="section" appearance="logo" />}
      {error && <ErrorAlert message={error} />}
      {!loading && filtered.length === 0 && <EmptyState>Nessun evento trovato.</EmptyState>}
      <EntityList
        items={filtered}
        previews={data?.previews}
        entityType="event"
        titleFor={(event) => event.title}
        subtitleFor={(event) => [event.place?.name, event.epoch?.name, formatPartialDate(event)].filter(Boolean).join(' · ')}
        descriptionFor={(event) => event.description}
      />
    </ListPage>
  );
}

function groupCountSubtitle(group: GroupSummary): string {
  const people = `${group.people_count} ${group.people_count === 1 ? 'persona' : 'persone'}`;
  const epochs = `${group.epoch_count} ${group.epoch_count === 1 ? 'epoca' : 'epoche'}`;
  return `${people} · ${epochs}`;
}

function GroupsList() {
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useAsync(() => loadEntityList(api.groups), []);
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (data?.items ?? []).filter((group) =>
      [group.name, group.description].some((value) =>
        (value ?? '').toLowerCase().includes(term),
      ),
    );
  }, [data, filter]);

  return (
    <ListPage title="Cerchie" createTo="/groups/new" filter={filter} onFilter={setFilter}>
      {loading && <LoadingIndicator variant="section" appearance="logo" />}
      {error && <ErrorAlert message={error} />}
      {!loading && filtered.length === 0 && <EmptyState>Nessuna cerchia trovata.</EmptyState>}
      <EntityList
        items={filtered}
        previews={data?.previews}
        entityType="group"
        titleFor={(group) => group.name}
        subtitleFor={groupCountSubtitle}
        descriptionFor={(group) => group.description}
      />
    </ListPage>
  );
}

function ListPage({
  title,
  createTo,
  filter,
  filterPlaceholder = 'Filtra per nome o descrizione',
  onFilter,
  children,
}: {
  title: string;
  createTo: string;
  filter: string;
  filterPlaceholder?: string;
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
          placeholder={filterPlaceholder}
        />
      </div>
      {children}
    </section>
  );
}

function EntityList<T extends { id: number; }>({
  items,
  previews,
  entityType,
  titleFor,
  subtitleFor,
  descriptionFor,
  badgeFor,
}: {
  items: T[];
  previews?: Map<number, MediaAsset>;
  entityType: EntityType;
  titleFor: (item: T) => string;
  subtitleFor?: (item: T) => string | null | undefined;
  descriptionFor: (item: T) => string | null | undefined;
  badgeFor?: (item: T) => EntityCardBadge | undefined;
}) {
  return (
    <div className="row g-3">
      {items.map((item) => {
        const title = titleFor(item);
        const subtitle = subtitleFor?.(item);
        const description = descriptionFor(item);
        const badge = badgeFor?.(item);
        return (
          <div className="col-12 col-md-6 col-xl-4 d-flex" key={item.id}>
            <EntityCard
              entityType={entityType}
              entityId={item.id}
              title={title}
              subtitle={subtitle}
              description={description}
              badge={badge}
              preview={previews?.get(item.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

function EntityCard({
  entityType,
  entityId,
  title,
  subtitle,
  description,
  badge,
  preview,
}: {
  entityType: EntityType;
  entityId: number;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  badge?: EntityCardBadge;
  preview?: MediaAsset;
}) {
  return (
    <Link className="entity-card border rounded bg-body p-3 text-decoration-none" to={detailPath(entityType, entityId)}>
      <span className="entity-card-summary d-flex gap-3">
        <EntityPreview asset={preview} label={title} />
        <span className="entity-card-copy min-w-0 flex-grow-1">
          <span className="entity-card-heading d-flex align-items-start gap-2">
            <span className="entity-card-title h5 mb-0 text-break flex-grow-1">{title}</span>
            {badge && (
              <span className={`badge ${badge.className} flex-shrink-0`}>
                {badge.label}
              </span>
            )}
          </span>
          {subtitle && (
            <span className="entity-card-subtitle small text-secondary d-block mt-1">
              {subtitle}
            </span>
          )}
        </span>
      </span>
      <span className="entity-card-description small text-secondary text-break">
        {description || 'Nessuna descrizione'}
      </span>
    </Link>
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

  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
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
  return <NamedEntityForm mode={mode} load={api.place} create={api.createPlace} update={api.updatePlace} />;
}

function EpochForm({ mode }: { mode: 'create' | 'edit'; }) {
  const { id } = useParams();
  const epochId = parseRouteId(id);
  const navigate = useNavigate();
  const isEdit = mode === 'edit';
  const { data, loading, error } = useAsync(
    async (): Promise<[Epoch | null, Event[]]> => (
      isEdit && epochId
        ? Promise.all([api.epoch(epochId), api.epochEvents(epochId)])
        : [null, []]
    ),
    [mode, epochId],
  );
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    rarity: '1',
    start_year: '',
    start_month: '',
    start_day: '',
    end_year: '',
    end_month: '',
    end_day: '',
  });
  const [validated, setValidated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const epoch = data?.[0];
    if (!epoch) return;
    setDraft({
      name: epoch.name,
      description: epoch.description ?? '',
      rarity: String(epoch.rarity),
      start_year: epoch.start_year ? String(epoch.start_year) : '',
      start_month: epoch.start_month ? String(epoch.start_month) : '',
      start_day: epoch.start_day ? String(epoch.start_day) : '',
      end_year: epoch.end_year ? String(epoch.end_year) : '',
      end_month: epoch.end_month ? String(epoch.end_month) : '',
      end_day: epoch.end_day ? String(epoch.end_day) : '',
    });
  }, [data]);

  const proposedRange = {
    start_year: nullableNumber(draft.start_year),
    start_month: nullableNumber(draft.start_month),
    start_day: nullableNumber(draft.start_day),
    end_year: nullableNumber(draft.end_year),
    end_month: nullableNumber(draft.end_month),
    end_day: nullableNumber(draft.end_day),
  };
  const rangeError = epochRangeError(proposedRange);
  const incompatibleEvents = (data?.[1] ?? []).filter(
    (linkedEvent) => eventEpochConflict(linkedEvent, proposedRange) !== null,
  );
  const hasDateConflict = Boolean(rangeError) || incompatibleEvents.length > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidated(true);
    if (!event.currentTarget.checkValidity() || hasDateConflict) return;
    setSubmitError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        description: cleanOptional(draft.description),
        rarity: Number(draft.rarity),
        ...proposedRange,
      };
      const saved = isEdit && epochId
        ? await api.updateEpoch(epochId, payload)
        : await api.createEpoch(payload);
      navigate(`/epochs/${saved.id}`);
    } catch (err) {
      setSubmitError(formatError(err, 'Non è stato possibile salvare le modifiche.'));
    }
  }

  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;

  const cancelTo = isEdit && epochId ? `/epochs/${epochId}` : '/epochs';
  return (
    <EntityFormShell title={isEdit ? 'Modifica epoca' : 'Nuova epoca'} backTo={cancelTo}>
      {submitError && <ErrorAlert message={submitError} />}
      {rangeError && <ErrorAlert message={rangeError} />}
      {incompatibleEvents.length > 0 && (
        <div className="alert alert-warning" role="alert">
          <strong className="d-block mb-1">Eventi fuori dall’intervallo proposto</strong>
          <span>
            Modifica le date prima di salvare. Eventi interessati:{' '}
            {incompatibleEvents.map((linkedEvent) => linkedEvent.title).join(', ')}.
          </span>
        </div>
      )}
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
          <PartialDateFields
            idPrefix="epoch-start"
            legend="Data di inizio"
            value={{
              year: draft.start_year,
              month: draft.start_month,
              day: draft.start_day,
            }}
            onChange={(part, value) => setDraft({ ...draft, [`start_${part}`]: value })}
          />
          <PartialDateFields
            idPrefix="epoch-end"
            legend="Data di fine"
            value={{
              year: draft.end_year,
              month: draft.end_month,
              day: draft.end_day,
            }}
            onChange={(part, value) => setDraft({ ...draft, [`end_${part}`]: value })}
          />
          <div className="col-12">
            <label className="form-label" htmlFor="description">Descrizione</label>
            <textarea className="form-control" id="description" rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
        </div>
        <FormActions cancelTo={cancelTo} disabled={hasDateConflict} />
      </form>
    </EntityFormShell>
  );
}

function NamedEntityForm({
  mode,
  load,
  create,
  update,
}: {
  mode: 'create' | 'edit';
  load: (id: number) => Promise<Place>;
  create: (payload: { name: string; address: string | null; description: string | null; rarity: number; }) => Promise<Place>;
  update: (id: number, payload: { name: string; address: string | null; description: string | null; rarity: number; }) => Promise<Place>;
}) {
  const { id } = useParams();
  const entityId = parseRouteId(id);
  const navigate = useNavigate();
  const isEdit = mode === 'edit';
  const { data, loading, error } = useAsync(() => (isEdit && entityId ? load(entityId) : Promise.resolve(null)), [mode, entityId]);
  const [draft, setDraft] = useState({ name: '', address: '', description: '', rarity: '1' });
  const [validated, setValidated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setDraft({
        name: data.name,
        address: data.address ?? '',
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
        name: draft.name.trim(),
        address: cleanOptional(draft.address),
        description: cleanOptional(draft.description),
        rarity: Number(draft.rarity),
      };
      const saved = isEdit && entityId ? await update(entityId, payload) : await create(payload);
      navigate(`/places/${saved.id}`);
    } catch (err) {
      setSubmitError(formatError(err, 'Non è stato possibile salvare le modifiche.'));
    }
  }

  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;

  const title = isEdit ? 'Modifica luogo' : 'Nuovo luogo';
  const cancelTo = isEdit && entityId ? `/places/${entityId}` : '/places';
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
            <label className="form-label" htmlFor="address">Indirizzo</label>
            <input
              className="form-control"
              id="address"
              maxLength={500}
              value={draft.address}
              onChange={(event) => setDraft({ ...draft, address: event.target.value })}
              placeholder="Es. Via Roma 10, Torino"
            />
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

function GroupForm({ mode }: { mode: 'create' | 'edit'; }) {
  const { id } = useParams();
  const groupId = parseRouteId(id);
  const navigate = useNavigate();
  const isEdit = mode === 'edit';
  const { data, loading, error } = useAsync(
    () => (isEdit && groupId ? api.group(groupId) : Promise.resolve(null)),
    [mode, groupId],
  );
  const [draft, setDraft] = useState({ name: '', description: '', rarity: '1' });
  const [validated, setValidated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setDraft({
        name: data.name,
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
        name: draft.name.trim(),
        description: cleanOptional(draft.description),
        rarity: Number(draft.rarity),
      };
      const saved = isEdit && groupId
        ? await api.updateGroup(groupId, payload)
        : await api.createGroup(payload);
      navigate(`/groups/${saved.id}`);
    } catch (err) {
      setSubmitError(formatError(err, 'Non è stato possibile salvare la cerchia.'));
    }
  }

  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;

  const cancelTo = isEdit && groupId ? `/groups/${groupId}` : '/groups';
  return (
    <EntityFormShell title={isEdit ? 'Modifica cerchia' : 'Nuova cerchia'} backTo={cancelTo}>
      {submitError && <ErrorAlert message={submitError} />}
      <form className={validated ? 'was-validated' : ''} noValidate onSubmit={submit}>
        <div className="row g-3">
          <div className="col-md-8">
            <label className="form-label" htmlFor="group-name">Nome<RequiredMark /></label>
            <input
              className="form-control"
              id="group-name"
              maxLength={255}
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <div className="invalid-feedback">Inserisci un nome.</div>
          </div>
          <div className="col-md-4">
            <RarityInput value={draft.rarity} onChange={(rarity) => setDraft({ ...draft, rarity })} />
          </div>
          <div className="col-12">
            <label className="form-label" htmlFor="group-description">Descrizione</label>
            <textarea
              className="form-control"
              id="group-description"
              rows={5}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </div>
        </div>
        <FormActions cancelTo={cancelTo} />
      </form>
    </EntityFormShell>
  );
}

type PartialDateDraft = {
  year: string;
  month: string;
  day: string;
};

function PartialDateFields({
  idPrefix,
  legend,
  value,
  onChange,
}: {
  idPrefix: string;
  legend: string;
  value: PartialDateDraft;
  onChange: (part: keyof PartialDateDraft, value: string) => void;
}) {
  return (
    <fieldset className="col-12">
      <legend className="h6 mb-2">{legend}</legend>
      <div className="row g-3">
        <div className="col-md-4">
          <label className="form-label" htmlFor={`${idPrefix}-year`}>Anno</label>
          <input
            className="form-control"
            id={`${idPrefix}-year`}
            type="number"
            min="1900"
            value={value.year}
            onChange={(event) => onChange('year', event.target.value)}
            placeholder="yyyy"
          />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor={`${idPrefix}-month`}>Mese</label>
          <input
            className="form-control"
            id={`${idPrefix}-month`}
            type="number"
            min="1"
            max="12"
            value={value.month}
            onChange={(event) => onChange('month', event.target.value)}
            placeholder="mm"
          />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor={`${idPrefix}-day`}>Giorno</label>
          <input
            className="form-control"
            id={`${idPrefix}-day`}
            type="number"
            min="1"
            max="31"
            value={value.day}
            onChange={(event) => onChange('day', event.target.value)}
            placeholder="dd"
          />
        </div>
      </div>
    </fieldset>
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

  const proposedDate: PartialDateValue = {
    year: nullableNumber(draft.year),
    month: nullableNumber(draft.month),
    day: nullableNumber(draft.day),
  };
  const dateError = partialDateError(proposedDate, 'La data dell’evento');
  const selectedEpoch = data?.[1].find(
    (epoch) => epoch.id === Number(draft.epoch_id),
  );
  const dateConflict = selectedEpoch
    ? eventEpochConflict(proposedDate, selectedEpoch)
    : null;
  const dateConflictMessage = dateConflict === 'before'
    ? 'La data dell’evento è precedente all’inizio dell’epoca selezionata.'
    : dateConflict === 'after'
      ? 'La data dell’evento è successiva alla fine dell’epoca selezionata.'
      : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidated(true);
    if (!event.currentTarget.checkValidity() || dateError || dateConflict) return;
    setSubmitError(null);
    try {
      const payload = {
        title: draft.title.trim(),
        description: cleanOptional(draft.description),
        place_id: Number(draft.place_id),
        epoch_id: Number(draft.epoch_id),
        ...proposedDate,
        rarity: Number(draft.rarity),
      };
      const saved = isEdit && eventId ? await api.updateEvent(eventId, payload) : await api.createEvent(payload);
      navigate(`/events/${saved.id}`);
    } catch (err) {
      setSubmitError(formatError(err, 'Non è stato possibile salvare le modifiche.'));
    }
  }

  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  const [places, epochs] = data;
  const cancelTo = isEdit && eventId ? `/events/${eventId}` : '/events';
  return (
    <EntityFormShell title={isEdit ? 'Modifica evento' : 'Nuovo evento'} backTo={cancelTo}>
      {submitError && <ErrorAlert message={submitError} />}
      {dateError && <ErrorAlert message={dateError} />}
      {dateConflictMessage && (
        <div className="alert alert-warning" role="alert">
          <strong className="d-block mb-1">Data fuori dall’intervallo dell’epoca</strong>
          {dateConflictMessage} Modifica la data o seleziona un’altra epoca.
        </div>
      )}
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
        <FormActions cancelTo={cancelTo} disabled={Boolean(dateError || dateConflict)} />
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
      <div className="border rounded bg-body p-4">{children}</div>
    </section>
  );
}

function FormActions({
  cancelTo,
  disabled = false,
}: {
  cancelTo: string;
  disabled?: boolean;
}) {
  return (
    <div className="d-flex justify-content-end gap-2 mt-4">
      <Link className="btn btn-outline-secondary" to={cancelTo}>Annulla</Link>
      <button className="btn btn-primary" type="submit" disabled={disabled}>
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
        ? Promise.all([
            api.person(personId),
            api.personPlaces(personId),
            api.personEvents(personId),
            api.personGroups(personId),
            api.media(personId),
          ])
        : Promise.resolve(null),
    [personId, parsedPersonId],
  );

  async function remove() {
    if (!window.confirm('Eliminare definitivamente questa persona?')) return;
    await api.deletePerson(personId);
    navigate('/people');
  }

  if (!parsedPersonId) return <ErrorAlert message="Persona non valida." />;
  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;
  const [person, places, events, groups, media] = data;

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
      <LinkedGroups groups={groups} />
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
  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;
  const [place, people, events, media] = data;

  return (
    <DetailShell title={place.name} entityType="place" entityId={place.id} media={media} onMediaChanged={reload} onDelete={remove}>
      {deleteError && <ErrorAlert message={deleteError} />}
      <InfoGrid
        items={[
          ['Indirizzo', place.address || 'Non indicato'],
          ['Rarità', String(place.rarity)],
          ['Eventi collegati', String(events.length)],
          ['Persone collegate', String(people.length)],
        ]}
      />
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
    () => (parsedEpochId ? Promise.all([
      api.epoch(epochId),
      api.epochEvents(epochId),
      api.epochGroups(epochId),
      api.media(epochId),
    ]) : Promise.resolve(null)),
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
  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;
  const [epoch, events, groups, media] = data;

  return (
    <DetailShell title={epoch.name} entityType="epoch" entityId={epoch.id} media={media} onMediaChanged={reload} onDelete={remove}>
      {deleteError && <ErrorAlert message={deleteError} />}
      <InfoGrid items={[
        ['Data di inizio', formatPartialDate(epochStart(epoch), 'Non indicata')],
        ['Data di fine', formatPartialDate(epochEnd(epoch), 'Non indicata')],
        ['Rarità', String(epoch.rarity)],
        ['Eventi collegati', String(events.length)],
      ]} />
      <Description text={epoch.description} />
      <EventListSection title="Eventi in questa epoca" events={events} />
      <LinkedGroups groups={groups} />
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
  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;
  const [event, participants, media] = data;

  return (
    <DetailShell title={event.title} entityType="event" entityId={event.id} media={media} onMediaChanged={reload} onDelete={remove}>
      <InfoGrid
        items={[
          ['Data', formatPartialDate(event)],
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

function GroupDetail() {
  const parsedGroupId = parseRouteId(useParams().id);
  const groupId = parsedGroupId ?? 0;
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [peopleCount, setPeopleCount] = useState<number | null>(null);
  const [epochCount, setEpochCount] = useState<number | null>(null);
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(
    () => (parsedGroupId ? Promise.all([
      api.group(groupId),
      api.groupPeople(groupId),
      api.groupEpochs(groupId),
      api.media(groupId),
    ]) : Promise.resolve(null)),
    [groupId, parsedGroupId],
  );

  useEffect(() => {
    if (data) {
      setPeopleCount(data[1].length);
      setEpochCount(data[2].length);
    }
  }, [data]);

  async function remove() {
    if (!window.confirm('Eliminare definitivamente questa cerchia?')) return;
    setDeleteError(null);
    try {
      await api.deleteGroup(groupId);
      navigate('/groups');
    } catch (err) {
      setDeleteError(formatError(err, 'Non è stato possibile eliminare la cerchia.'));
    }
  }

  if (!parsedGroupId) return <ErrorAlert message="Cerchia non valida." />;
  if (loading) return <LoadingIndicator variant="page" appearance="logo" />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;
  const [group, people, epochs, media] = data;

  return (
    <DetailShell
      title={group.name}
      entityType="group"
      entityId={group.id}
      media={media}
      onMediaChanged={reload}
      onDelete={remove}
    >
      {deleteError && <ErrorAlert message={deleteError} />}
      <InfoGrid items={[
        ['Rarità', String(group.rarity)],
        ['Persone collegate', String(peopleCount ?? people.length)],
        ['Epoche collegate', String(epochCount ?? epochs.length)],
      ]} />
      <Description text={group.description} />
      <GroupPeopleEditor groupId={group.id} initialPeople={people} onSaved={setPeopleCount} />
      <GroupEpochsEditor groupId={group.id} initialEpochs={epochs} onSaved={setEpochCount} />
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
          <p className="text-secondary mb-3">{entityLabels[entityType]}</p>
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
    <section className="border rounded bg-body p-4">
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
    <section className="border rounded bg-body p-4">
      <h2 className="h5">Descrizione</h2>
      <p className="mb-0 text-preline text-break">{text || 'Nessuna descrizione.'}</p>
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
                <div className={`carousel-item h-100${index === displayedIndex ? ' active' : ''}`} key={`${asset.id}:${asset.created_at}`}>
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
                      key={`${asset.id}:${asset.created_at}`}
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
          {uploading ? <LoadingIndicator variant="inline" appearance="bootstrap" label="Caricamento immagine" /> : <i className="bi bi-upload" aria-hidden="true" />}
        </button>
      </div>
      {!onError && error && <div className="mt-2"><ErrorAlert message={error} /></div>}
    </div>
  );
}

function useAuthenticatedMediaUrl(asset?: MediaAsset) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const identity = asset ? `${asset.id}:${asset.created_at}` : null;

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setError(false);
    if (!asset) return () => undefined;

    api
      .mediaBlob(asset.id, asset.created_at)
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
  }, [identity]);

  return { objectUrl, error };
}

function EntityPreview({ asset, label }: { asset?: MediaAsset; label: string; }) {
  const { objectUrl, error } = useAuthenticatedMediaUrl(asset);
  return (
    <span className="entity-preview d-flex align-items-center justify-content-center">
      {objectUrl && !error ? (
        <>
          <img className="entity-preview-backdrop" src={objectUrl} alt="" aria-hidden="true" />
          <img className="entity-preview-image" src={objectUrl} alt={`Anteprima di ${label}`} />
        </>
      ) : asset && !error ? (
        <LoadingIndicator variant="media" appearance="bootstrap" label={`Caricamento anteprima di ${label}`} />
      ) : (
        <span role="img" aria-label="Nessuna immagine">
          <i className="bi bi-image text-secondary" aria-hidden="true" />
        </span>
      )}
    </span>
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
  const { objectUrl, error } = useAuthenticatedMediaUrl(asset);

  return (
    <div className="media-slide h-100">
      <div className="media-carousel-frame d-flex align-items-center justify-content-center h-100">
        {error && <span className="text-secondary">Immagine non disponibile</span>}
        {!error && !objectUrl && <LoadingIndicator variant="media" appearance="bootstrap" label={`Caricamento immagine ${position} di ${total}`} />}
        {objectUrl && (
          <>
            <img className="media-carousel-backdrop" src={objectUrl} alt="" aria-hidden="true" />
            <img className="media-carousel-image" src={objectUrl} alt={`Immagine ${position} di ${total}`} />
          </>
        )}
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
            {deleting ? <LoadingIndicator variant="inline" appearance="bootstrap" label={`Eliminazione immagine ${position} di ${total}`} /> : <i className="bi bi-trash" aria-hidden="true" />}
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
    <section className="border rounded bg-body p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">Luoghi collegati</h2>
        <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setRows([...rows, { place_id: '', motivation: '' }])}>
          <i className="bi bi-plus-lg me-1" />
          Aggiungi
        </button>
      </div>
      {loading && <LoadingIndicator variant="section" appearance="logo" />}
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

function GroupPeopleEditor({
  groupId,
  initialPeople,
  onSaved,
}: {
  groupId: number;
  initialPeople: Person[];
  onSaved: (count: number) => void;
}) {
  const { data: people, loading, error } = useAsync(api.people, []);
  const [rows, setRows] = useState(() => initialPeople.map((person) => String(person.id)));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRows(initialPeople.map((person) => String(person.id)));
  }, [initialPeople]);

  async function save() {
    const ids = rows.filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      setSaveError('Ogni persona può comparire una sola volta.');
      setSaved(false);
      return;
    }
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await api.replaceGroupPeople(groupId, ids.map(Number));
      setRows(updated.map((person) => String(person.id)));
      onSaved(updated.length);
      setSaved(true);
    } catch (err) {
      setSaveError(formatError(err, 'Non è stato possibile salvare le persone della cerchia.'));
    }
  }

  return (
    <section className="border rounded bg-body p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">Persone della cerchia</h2>
        <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setRows([...rows, ''])}>
          <i className="bi bi-plus-lg me-1" />
          Aggiungi
        </button>
      </div>
      {loading && <LoadingIndicator variant="section" appearance="logo" />}
      {error && <ErrorAlert message={error} />}
      {saveError && <ErrorAlert message={saveError} />}
      {saved && <div className="alert alert-success">Persone della cerchia salvate.</div>}
      {people && (
        <>
          {rows.length === 0 && <p className="text-secondary">Nessuna persona collegata.</p>}
          {rows.map((personId, index) => (
            <div className="row g-2 align-items-end mb-2" key={index}>
              <div className="col-md-11">
                <label className="form-label" htmlFor={`group-person-${index}`}>Persona</label>
                <select
                  className="form-select"
                  id={`group-person-${index}`}
                  value={personId}
                  onChange={(event) => setRows(rows.map((value, rowIndex) => rowIndex === index ? event.target.value : value))}
                >
                  <option value="">Scegli persona</option>
                  {people.map((person) => <option value={person.id} key={person.id}>{person.alias}</option>)}
                </select>
              </div>
              <div className="col-md-1">
                <button className="btn btn-outline-danger w-100" type="button" onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))} aria-label="Rimuovi persona dalla cerchia">
                  <i className="bi bi-x-lg" />
                </button>
              </div>
            </div>
          ))}
          <button className="btn btn-primary mt-2" type="button" onClick={save}>Salva persone</button>
        </>
      )}
    </section>
  );
}

function GroupEpochsEditor({
  groupId,
  initialEpochs,
  onSaved,
}: {
  groupId: number;
  initialEpochs: Epoch[];
  onSaved: (count: number) => void;
}) {
  const { data: epochs, loading, error } = useAsync(api.epochs, []);
  const [rows, setRows] = useState(() => initialEpochs.map((epoch) => String(epoch.id)));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRows(initialEpochs.map((epoch) => String(epoch.id)));
  }, [initialEpochs]);

  async function save() {
    const ids = rows.filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      setSaveError('Ogni epoca può comparire una sola volta.');
      setSaved(false);
      return;
    }
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await api.replaceGroupEpochs(groupId, ids.map(Number));
      setRows(updated.map((epoch) => String(epoch.id)));
      onSaved(updated.length);
      setSaved(true);
    } catch (err) {
      setSaveError(formatError(err, 'Non è stato possibile salvare le epoche della cerchia.'));
    }
  }

  return (
    <section className="border rounded bg-body p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">Epoche della cerchia</h2>
        <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setRows([...rows, ''])}>
          <i className="bi bi-plus-lg me-1" />
          Aggiungi
        </button>
      </div>
      {loading && <LoadingIndicator variant="section" appearance="logo" />}
      {error && <ErrorAlert message={error} />}
      {saveError && <ErrorAlert message={saveError} />}
      {saved && <div className="alert alert-success">Epoche della cerchia salvate.</div>}
      {epochs && (
        <>
          {rows.length === 0 && <p className="text-secondary">Nessuna epoca collegata.</p>}
          {rows.map((epochId, index) => (
            <div className="row g-2 align-items-end mb-2" key={index}>
              <div className="col-md-11">
                <label className="form-label" htmlFor={`group-epoch-${index}`}>Epoca</label>
                <select
                  className="form-select"
                  id={`group-epoch-${index}`}
                  value={epochId}
                  onChange={(event) => setRows(rows.map((value, rowIndex) => rowIndex === index ? event.target.value : value))}
                >
                  <option value="">Scegli epoca</option>
                  {epochs.map((epoch) => <option value={epoch.id} key={epoch.id}>{epoch.name}</option>)}
                </select>
              </div>
              <div className="col-md-1">
                <button className="btn btn-outline-danger w-100" type="button" onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))} aria-label="Rimuovi epoca dalla cerchia">
                  <i className="bi bi-x-lg" />
                </button>
              </div>
            </div>
          ))}
          <button className="btn btn-primary mt-2" type="button" onClick={save}>Salva epoche</button>
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
    <section className="border rounded bg-body p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">Partecipanti</h2>
        <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setRows([...rows, { person_id: '', role: '', motivation: '' }])}>
          <i className="bi bi-plus-lg me-1" />
          Aggiungi
        </button>
      </div>
      {loading && <LoadingIndicator variant="section" appearance="logo" />}
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
    <section className="border rounded bg-body p-4">
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

function LinkedGroups({ groups }: { groups: Group[]; }) {
  return (
    <section className="border rounded bg-body p-4">
      <h2 className="h5">Cerchie</h2>
      {groups.length === 0 ? <p className="text-secondary mb-0">Nessuna cerchia collegata.</p> : (
        <div className="list-group list-group-flush">
          {groups.map((group) => (
            <Link className="list-group-item list-group-item-action px-0" to={`/groups/${group.id}`} key={group.id}>
              <span className="fw-semibold">{group.name}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function LinkedPeople({ links }: { links: PlacePerson[]; }) {
  return (
    <section className="border rounded bg-body p-4">
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
    <section className="border rounded bg-body p-4">
      <h2 className="h5">{title}</h2>
      {events.length === 0 ? <p className="text-secondary mb-0">Nessun evento collegato.</p> : (
        <div className="list-group list-group-flush">
          {events.map((event) => (
            <Link className="list-group-item list-group-item-action px-0" to={`/events/${event.id}`} key={event.id}>
              <div className="d-flex justify-content-between gap-3">
                <span>{event.title}</span>
                <span className="text-secondary small">{formatPartialDate(event)}</span>
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
        <input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca persone, luoghi, epoche, eventi e cerchie" />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? (
            <span className="me-2"><LoadingIndicator variant="inline" label="Ricerca in corso" /></span>
          ) : (
            <i className="bi bi-search me-2" />
          )}
          {loading ? 'Ricerca...' : 'Cerca'}
        </button>
      </form>
      {loading && <LoadingIndicator variant="section" appearance="logo" />}
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
  const [loadingMode, setLoadingMode] = useState<'random' | 'daily' | null>(null);

  async function pull(mode: 'random' | 'daily') {
    setLoadingMode(mode);
    setError(null);
    try {
      const selected = entityType || undefined;
      setResult(mode === 'daily' ? await api.dailyPull(selected) : await api.randomPull(selected));
    } catch (err) {
      setError(formatError(err, 'Non è stato possibile completare l’estrazione.'));
    } finally {
      setLoadingMode(null);
    }
  }

  return (
    <section className="mx-auto pulls-page">
      <h1 className="h2 mb-4">Estrazioni</h1>
      <div className="border rounded bg-body p-4">
        <div className="row g-3 align-items-end">
          <div className="col-md-6">
            <label className="form-label" htmlFor="pull-type">Tipo</label>
            <select className="form-select" id="pull-type" value={entityType} onChange={(event) => setEntityType(event.target.value as EntityType | '')}>
              <option value="">Tutto</option>
              {Object.entries(entityPluralLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </div>
          <div className="col-md-6 d-flex gap-2">
            <button className="btn btn-primary flex-fill" type="button" disabled={loadingMode !== null} onClick={() => pull('random')}>
              {loadingMode === 'random' ? (
                <span className="me-2"><LoadingIndicator variant="inline" label="Estrazione in corso" /></span>
              ) : (
                <i className="bi bi-shuffle me-2" />
              )}
              {loadingMode === 'random' ? 'Estrazione...' : 'Estrai'}
            </button>
            <button className="btn btn-outline-primary flex-fill" type="button" disabled={loadingMode !== null} onClick={() => pull('daily')}>
              {loadingMode === 'daily' ? (
                <span className="me-2"><LoadingIndicator variant="inline" label="Estrazione del giorno in corso" /></span>
              ) : (
                <i className="bi bi-sun me-2" />
              )}
              {loadingMode === 'daily' ? 'Estrazione...' : 'Del giorno'}
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
