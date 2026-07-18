import { useEffect, useState, type DependencyList, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatError } from './api';
import type {
  AdminActivity,
  AdminActivitySource,
  AdminUser,
  AdminUserDetail,
  EntityType,
  User,
} from './types';

const contentPaths: Record<EntityType, string> = {
  person: '/people',
  place: '/places',
  epoch: '/epochs',
  event: '/events',
};

const actionLabels: Record<string, string> = {
  create: 'Creazione contenuto',
  update: 'Modifica contenuto',
  delete: 'Eliminazione contenuto',
  replace_participants: 'Partecipanti aggiornati',
  replace_places: 'Luoghi collegati aggiornati',
  upload_media: 'Immagine caricata',
  delete_media: 'Immagine eliminata',
  user_created: 'Utente creato',
  display_name_changed: 'Nome visualizzato modificato',
  role_changed: 'Ruolo modificato',
  user_activated: 'Utente riattivato',
  user_deactivated: 'Utente disattivato',
  password_changed: 'Password modificata',
  password_reset: 'Password reimpostata',
  sessions_revoked: 'Sessioni revocate',
  login_succeeded: 'Accesso riuscito',
  login_failed: 'Accesso fallito',
  login_rate_limited: 'Accesso bloccato',
  logout: 'Disconnessione',
};

const sourceLabels: Record<AdminActivitySource, string> = {
  content: 'Contenuti',
  account: 'Account',
  authentication: 'Accessi',
};

function useAdminData<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loader()
      .then((value) => { if (!cancelled) setData(value); })
      .catch((reason: unknown) => {
        if (!cancelled) setError(formatError(reason, 'Non è stato possibile caricare i dati amministrativi.'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [...deps, version]);

  return { data, loading, error, reload: () => setVersion((value) => value + 1) };
}

function Loading() {
  return <div className="d-flex align-items-center gap-2 py-5 text-secondary"><span className="spinner-border spinner-border-sm" aria-hidden="true" /><span>Caricamento...</span></div>;
}

function ErrorAlert({ message }: { message: string }) {
  return <div className="alert alert-danger" role="alert">{message}</div>;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function activityContent(item: AdminActivity): ReactNode {
  const label = actionLabels[item.action] || item.action;
  return (
    <>
      <span className="d-flex flex-wrap align-items-center gap-2">
        <span className="fw-semibold text-break">{item.title || label}</span>
        <span className="badge text-bg-light">{sourceLabels[item.source]}</span>
      </span>
      <span className="small text-secondary d-block mt-1">
        {label} · {item.actor?.display_name || 'Utente non disponibile'}
        {item.source_ip ? ` · ${item.source_ip}` : ''}
      </span>
    </>
  );
}

function ActivityList({ items, empty = 'Nessuna attività registrata.' }: { items: AdminActivity[]; empty?: string }) {
  if (items.length === 0) return <div className="text-secondary py-3">{empty}</div>;
  return (
    <div className="list-group list-group-flush">
      {items.map((item, index) => {
        const key = `${item.source}:${item.action}:${item.occurred_at}:${index}`;
        const className = 'list-group-item px-0 d-flex justify-content-between align-items-start gap-3';
        const time = <time className="small text-secondary text-nowrap" dateTime={item.occurred_at}>{formatTimestamp(item.occurred_at)}</time>;
        if (item.linkable && item.entity_type && item.entity_id) {
          return (
            <Link className={`${className} list-group-item-action`} to={`${contentPaths[item.entity_type]}/${item.entity_id}`} key={key}>
              <span className="min-w-0">{activityContent(item)}</span>{time}
            </Link>
          );
        }
        return <div className={className} key={key}><span className="min-w-0">{activityContent(item)}</span>{time}</div>;
      })}
    </div>
  );
}

export function AdminDashboard() {
  const { data, loading, error } = useAdminData(
    () => Promise.all([api.adminSummary(), api.adminUsers(), api.adminActivity({ pageSize: 10 })]),
    [],
  );
  if (loading) return <Loading />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;
  const [summary, users, activity] = data;
  const metrics = [
    ['Utenti attivi', summary.active_users, 'bi-person-check'],
    ['Utenti inattivi', summary.inactive_users, 'bi-person-dash'],
    ['Amministratori', summary.admin_users, 'bi-shield-check'],
    ['Sessioni attive', summary.active_sessions, 'bi-key'],
    ['Persone', summary.people, 'bi-people'],
    ['Luoghi', summary.places, 'bi-geo-alt'],
    ['Epoche', summary.epochs, 'bi-hourglass-split'],
    ['Eventi', summary.events, 'bi-calendar-event'],
    ['Immagini', summary.media, 'bi-images'],
    ['Attività 24h', summary.activity_last_24h, 'bi-activity'],
  ] as const;

  return (
    <section>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div><h1 className="h2 mb-1">Amministrazione</h1><p className="text-secondary mb-0">Utenti, accessi e stato del sistema.</p></div>
        <div className="d-flex gap-2">
          <Link className="btn btn-outline-primary" to="/admin/activity"><i className="bi bi-activity me-2" />Attività</Link>
          <Link className="btn btn-primary" to="/admin/users/new"><i className="bi bi-person-plus me-2" />Nuovo utente</Link>
        </div>
      </div>
      <div className="row g-3 mb-4">
        {metrics.map(([label, value, icon]) => (
          <div className="col-6 col-md-4 col-xl" key={label}>
            <div className="border rounded bg-body p-3 h-100 admin-metric">
              <div className="d-flex justify-content-between gap-2 text-secondary small"><span>{label}</span><i className={`bi ${icon}`} /></div>
              <strong className="h3 mb-0 d-block mt-1">{value}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="row g-4">
        <div className="col-xl-7">
          <section className="border rounded bg-body p-3 p-md-4">
            <h2 className="h5 mb-3">Utenti</h2>
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead><tr><th>Utente</th><th>Ruolo</th><th>Stato</th><th>Sessioni</th><th><span className="visually-hidden">Azioni</span></th></tr></thead>
                <tbody>{users.map((user) => <AdminUserRow user={user} key={user.id} />)}</tbody>
              </table>
            </div>
          </section>
        </div>
        <div className="col-xl-5">
          <section className="border rounded bg-body p-3 p-md-4">
            <div className="d-flex justify-content-between align-items-center mb-2"><h2 className="h5 mb-0">Attività recente</h2><Link className="small" to="/admin/activity">Vedi tutte</Link></div>
            <ActivityList items={activity.items} />
          </section>
        </div>
      </div>
    </section>
  );
}

function AdminUserRow({ user }: { user: AdminUser }) {
  return (
    <tr>
      <td><span className="fw-semibold d-block">{user.display_name}</span><span className="small text-secondary">@{user.username}</span></td>
      <td>{user.is_admin ? <span className="badge text-bg-primary">Admin</span> : <span className="badge text-bg-light">Utente</span>}</td>
      <td>{user.is_active ? <span className="badge text-bg-success">Attivo</span> : <span className="badge text-bg-secondary">Inattivo</span>}</td>
      <td>{user.active_session_count}</td>
      <td className="text-end"><Link className="btn btn-outline-secondary btn-sm" to={`/admin/users/${user.id}`} aria-label={`Gestisci ${user.display_name}`}><i className="bi bi-chevron-right" /></Link></td>
    </tr>
  );
}

export function AdminUserCreatePage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [validated, setValidated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidated(true);
    setError(null);
    if (!event.currentTarget.checkValidity()) return;
    if (password !== confirmation) {
      setError('La conferma non corrisponde alla password.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.createAdminUser({
        username,
        display_name: displayName,
        password,
        is_admin: isAdmin,
      });
      navigate(`/admin/users/${created.id}`);
    } catch (reason) {
      setError(formatError(reason, 'Non è stato possibile creare l’utente.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="admin-form-page">
      <AdminBackLink />
      <h1 className="h2 mt-2 mb-4">Nuovo utente</h1>
      <form className={`border rounded bg-body p-4${validated ? ' was-validated' : ''}`} noValidate onSubmit={submit}>
        {error && <ErrorAlert message={error} />}
        <div className="row g-3">
          <div className="col-md-6"><label className="form-label" htmlFor="admin-new-username">Username *</label><input className="form-control" id="admin-new-username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={80} required /></div>
          <div className="col-md-6"><label className="form-label" htmlFor="admin-new-display">Nome visualizzato *</label><input className="form-control" id="admin-new-display" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={160} required /></div>
          <div className="col-md-6"><label className="form-label" htmlFor="admin-new-password">Password *</label><input className="form-control" id="admin-new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={200} required /></div>
          <div className="col-md-6"><label className="form-label" htmlFor="admin-new-confirmation">Conferma password *</label><input className={`form-control${validated && confirmation !== password ? ' is-invalid' : ''}`} id="admin-new-confirmation" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} maxLength={200} required /><div className="invalid-feedback">Le password devono coincidere.</div></div>
          <div className="col-12"><div className="form-check form-switch"><input className="form-check-input" id="admin-new-role" type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} /><label className="form-check-label" htmlFor="admin-new-role">Amministratore</label></div></div>
        </div>
        <div className="d-flex gap-2 mt-4"><button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Creazione...' : 'Crea utente'}</button><Link className="btn btn-outline-secondary" to="/admin">Annulla</Link></div>
      </form>
    </section>
  );
}

export function AdminUserPage({
  currentUser,
  onCurrentUserChange,
}: {
  currentUser: User;
  onCurrentUserChange: (user: User) => void;
}) {
  const userId = parsePositiveId(useParams().id);
  const state = useAdminData<AdminUserDetail>(
    () => userId ? api.adminUser(userId) : Promise.reject(new Error('invalid user')),
    [userId],
  );
  const [displayName, setDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.data) {
      setDisplayName(state.data.user.display_name);
      setIsAdmin(state.data.user.is_admin);
    }
  }, [state.data]);

  if (!userId) return <ErrorAlert message="Utente non valido." />;
  if (state.loading) return <Loading />;
  if (state.error) return <ErrorAlert message={state.error} />;
  if (!state.data) return null;
  const target = state.data.user;
  const isSelf = target.id === currentUser.id;

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayName.trim()) return;
    setBusy(true); setFormError(null); setFeedback(null);
    try {
      const updated = await api.updateAdminUser(target.id, {
        display_name: displayName,
        is_admin: isAdmin,
        is_active: target.is_active,
      });
      if (isSelf) onCurrentUserChange(updated);
      setFeedback('Account aggiornato.');
      state.reload();
    } catch (reason) {
      setFormError(formatError(reason, 'Non è stato possibile aggiornare l’account.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    const activate = !target.is_active;
    const confirmationText = activate
      ? `Riattivare @${target.username}?`
      : `Disattivare @${target.username} e revocare tutte le sessioni?`;
    if (!window.confirm(confirmationText)) return;
    setBusy(true); setFormError(null); setFeedback(null);
    try {
      await api.updateAdminUser(target.id, {
        display_name: target.display_name,
        is_admin: target.is_admin,
        is_active: activate,
      });
      setFeedback(activate ? 'Utente riattivato.' : 'Utente disattivato.');
      state.reload();
    } catch (reason) {
      setFormError(formatError(reason, 'Non è stato possibile cambiare lo stato.'));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null); setFeedback(null);
    if (newPassword.length < 12 || newPassword !== confirmation) {
      setFormError('La password deve avere almeno 12 caratteri e coincidere con la conferma.');
      return;
    }
    setBusy(true);
    try {
      await api.resetAdminUserPassword(target.id, newPassword);
      setNewPassword(''); setConfirmation('');
      setFeedback('Password reimpostata e sessioni revocate.');
      state.reload();
    } catch (reason) {
      setFormError(formatError(reason, 'Non è stato possibile reimpostare la password.'));
    } finally {
      setBusy(false);
    }
  }

  async function revokeSessions() {
    if (!window.confirm(`Revocare le sessioni di @${target.username}?`)) return;
    setBusy(true); setFormError(null); setFeedback(null);
    try {
      const result = await api.revokeAdminUserSessions(target.id);
      setFeedback(`Sessioni revocate: ${result.revoked_count}.`);
      state.reload();
    } catch (reason) {
      setFormError(formatError(reason, 'Non è stato possibile revocare le sessioni.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <AdminBackLink />
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mt-2 mb-4">
        <div><h1 className="h2 mb-1">{target.display_name}</h1><p className="text-secondary mb-0">@{target.username}</p></div>
        <div className="d-flex gap-2"><span className={`badge ${target.is_active ? 'text-bg-success' : 'text-bg-secondary'}`}>{target.is_active ? 'Attivo' : 'Inattivo'}</span>{target.is_admin && <span className="badge text-bg-primary">Amministratore</span>}</div>
      </div>
      {formError && <ErrorAlert message={formError} />}
      {feedback && <div className="alert alert-success" role="status">{feedback}</div>}
      <div className="row g-4 mb-4">
        <div className="col-lg-6"><AccountEditor target={target} isSelf={isSelf} displayName={displayName} isAdmin={isAdmin} busy={busy} onDisplayName={setDisplayName} onAdmin={setIsAdmin} onSubmit={saveAccount} onToggleStatus={toggleStatus} /></div>
        <div className="col-lg-6"><SecurityEditor target={target} isSelf={isSelf} busy={busy} newPassword={newPassword} confirmation={confirmation} onNewPassword={setNewPassword} onConfirmation={setConfirmation} onReset={resetPassword} onRevoke={revokeSessions} /></div>
      </div>
      <div className="row g-4">
        <div className="col-lg-6"><section className="border rounded bg-body p-4"><h2 className="h5">Attività sui contenuti</h2><ActivityList items={state.data.content_activity} /></section></div>
        <div className="col-lg-6"><section className="border rounded bg-body p-4"><h2 className="h5">Account e accessi</h2><ActivityList items={state.data.account_activity} /></section></div>
      </div>
    </section>
  );
}

function AccountEditor({ target, isSelf, displayName, isAdmin, busy, onDisplayName, onAdmin, onSubmit, onToggleStatus }: {
  target: AdminUser; isSelf: boolean; displayName: string; isAdmin: boolean; busy: boolean;
  onDisplayName: (value: string) => void; onAdmin: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onToggleStatus: () => void;
}) {
  return (
    <section className="border rounded bg-body p-4 h-100">
      <h2 className="h5 mb-3">Account</h2>
      <form onSubmit={onSubmit}>
        <label className="form-label" htmlFor="admin-display-name">Nome visualizzato</label>
        <input className="form-control mb-3" id="admin-display-name" value={displayName} onChange={(event) => onDisplayName(event.target.value)} maxLength={160} required />
        <div className="form-check form-switch mb-4"><input className="form-check-input" id="admin-role" type="checkbox" checked={isAdmin} disabled={isSelf} onChange={(event) => onAdmin(event.target.checked)} /><label className="form-check-label" htmlFor="admin-role">Amministratore</label></div>
        <div className="d-flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy} type="submit">Salva</button><button className={`btn ${target.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`} disabled={busy || isSelf} type="button" onClick={onToggleStatus}>{target.is_active ? 'Disattiva' : 'Riattiva'}</button></div>
      </form>
    </section>
  );
}

function SecurityEditor({ target, isSelf, busy, newPassword, confirmation, onNewPassword, onConfirmation, onReset, onRevoke }: {
  target: AdminUser; isSelf: boolean; busy: boolean; newPassword: string; confirmation: string;
  onNewPassword: (value: string) => void; onConfirmation: (value: string) => void;
  onReset: (event: FormEvent<HTMLFormElement>) => void; onRevoke: () => void;
}) {
  return (
    <section className="border rounded bg-body p-4 h-100">
      <h2 className="h5 mb-3">Sicurezza</h2>
      <dl className="row small"><dt className="col-8 fw-normal text-secondary">Sessioni attive</dt><dd className="col-4 text-end fw-semibold">{target.active_session_count}</dd></dl>
      <button className="btn btn-outline-secondary mb-4" type="button" disabled={busy || target.active_session_count === 0} onClick={onRevoke}><i className="bi bi-key me-2" />Revoca sessioni</button>
      {isSelf ? <Link className="btn btn-outline-primary d-block" to="/profile">Cambia password dal profilo</Link> : (
        <form onSubmit={onReset}>
          <label className="form-label" htmlFor="admin-reset-password">Nuova password</label><input className="form-control mb-3" id="admin-reset-password" type="password" value={newPassword} onChange={(event) => onNewPassword(event.target.value)} minLength={12} maxLength={200} required />
          <label className="form-label" htmlFor="admin-reset-confirmation">Conferma password</label><input className="form-control mb-3" id="admin-reset-confirmation" type="password" value={confirmation} onChange={(event) => onConfirmation(event.target.value)} minLength={12} maxLength={200} required />
          <button className="btn btn-outline-primary" disabled={busy} type="submit">Reimposta password</button>
        </form>
      )}
    </section>
  );
}

export function AdminActivityPage() {
  const [page, setPage] = useState(1);
  const [actor, setActor] = useState('');
  const [source, setSource] = useState<AdminActivitySource | ''>('');
  const [action, setAction] = useState('');
  const users = useAdminData(api.adminUsers, []);
  const activity = useAdminData(
    () => api.adminActivity({
      page,
      pageSize: 50,
      actorUserId: actor ? Number(actor) : undefined,
      source: source || undefined,
      action: action || undefined,
    }),
    [page, actor, source, action],
  );
  const totalPages = activity.data ? Math.max(1, Math.ceil(activity.data.total / activity.data.page_size)) : 1;

  return (
    <section>
      <AdminBackLink />
      <h1 className="h2 mt-2 mb-4">Attività del sistema</h1>
      <div className="border rounded bg-body p-3 mb-4"><div className="row g-3">
        <div className="col-md-4"><label className="form-label" htmlFor="activity-user">Utente</label><select className="form-select" id="activity-user" value={actor} onChange={(event) => { setActor(event.target.value); setPage(1); }}><option value="">Tutti</option>{users.data?.map((user) => <option value={user.id} key={user.id}>{user.display_name}</option>)}</select></div>
        <div className="col-md-4"><label className="form-label" htmlFor="activity-source">Origine</label><select className="form-select" id="activity-source" value={source} onChange={(event) => { setSource(event.target.value as AdminActivitySource | ''); setPage(1); }}><option value="">Tutte</option><option value="content">Contenuti</option><option value="account">Account</option><option value="authentication">Accessi</option></select></div>
        <div className="col-md-4"><label className="form-label" htmlFor="activity-action">Azione</label><select className="form-select" id="activity-action" value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }}><option value="">Tutte</option>{Object.entries(actionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      </div></div>
      {activity.loading && <Loading />}
      {activity.error && <ErrorAlert message={activity.error} />}
      {activity.data && (
        <section className="border rounded bg-body p-3 p-md-4">
          <ActivityList items={activity.data.items} />
          <nav className="d-flex justify-content-between align-items-center pt-3 border-top" aria-label="Paginazione attività">
            <button className="btn btn-outline-secondary btn-sm" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Precedente</button>
            <span className="small text-secondary">Pagina {page} di {totalPages}</span>
            <button className="btn btn-outline-secondary btn-sm" type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Successiva</button>
          </nav>
        </section>
      )}
    </section>
  );
}

function AdminBackLink() {
  return <Link className="small text-decoration-none" to="/admin"><i className="bi bi-arrow-left me-1" />Amministrazione</Link>;
}

function parsePositiveId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
