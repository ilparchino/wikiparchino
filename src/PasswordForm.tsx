import { useState, type FormEvent } from 'react';
import { ApiError, formatError } from './api';
import { PasswordInput } from './PasswordInput';
import { PASSWORD_REQUIREMENTS, passwordPolicyError } from './passwordPolicy';

type PasswordSubmission = {
  currentPassword?: string;
  newPassword: string;
};

type PasswordFormProps = {
  idPrefix: string;
  requireCurrentPassword?: boolean;
  onSubmit: (submission: PasswordSubmission) => Promise<void>;
  successMessage: string;
  badRequestMessage: string;
};

export function PasswordForm({
  idPrefix,
  requireCurrentPassword = false,
  onSubmit,
  successMessage,
  badRequestMessage,
}: PasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentPasswordError = (
    submitted && requireCurrentPassword && currentPassword.length === 0
      ? 'Inserisci la password attuale.'
      : null
  );
  const newPasswordError = submitted ? passwordPolicyError(newPassword) : null;
  const confirmationError = (
    submitted && confirmation !== newPassword
      ? 'La conferma non corrisponde alla nuova password.'
      : null
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setRequestError(null);
    setSuccess(null);

    const policyError = passwordPolicyError(newPassword);
    if (
      (requireCurrentPassword && currentPassword.length === 0)
      || policyError
      || confirmation !== newPassword
    ) {
      return;
    }
    if (requireCurrentPassword && newPassword === currentPassword) {
      setRequestError('La nuova password deve essere diversa da quella attuale.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        currentPassword: requireCurrentPassword ? currentPassword : undefined,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setSubmitted(false);
      setSuccess(successMessage);
    } catch (reason) {
      setRequestError(
        reason instanceof ApiError && reason.status === 400
          ? badRequestMessage
          : formatError(reason, 'Non è stato possibile aggiornare la password.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="border rounded bg-body p-4" aria-labelledby={`${idPrefix}-password-heading`}>
      <h2 className="h5" id={`${idPrefix}-password-heading`}>Cambia password</h2>
      {requestError && <div className="alert alert-danger" role="alert">{requestError}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}
      <form noValidate onSubmit={submit}>
        {requireCurrentPassword && (
          <div className="mb-3">
            <label className="form-label" htmlFor={`${idPrefix}-current-password`}>
              Password attuale <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <PasswordInput
              autoComplete="current-password"
              error={currentPasswordError}
              id={`${idPrefix}-current-password`}
              value={currentPassword}
              onChange={setCurrentPassword}
              required
            />
          </div>
        )}
        <div className="mb-3">
          <label className="form-label" htmlFor={`${idPrefix}-new-password`}>
            Nuova password <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <PasswordInput
            autoComplete="new-password"
            describedBy={`${idPrefix}-password-requirements`}
            error={newPasswordError}
            id={`${idPrefix}-new-password`}
            value={newPassword}
            onChange={setNewPassword}
            required
          />
          <div className="form-text" id={`${idPrefix}-password-requirements`}>
            {PASSWORD_REQUIREMENTS}
          </div>
        </div>
        <div className="mb-4">
          <label className="form-label" htmlFor={`${idPrefix}-confirm-password`}>
            Conferma nuova password <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <PasswordInput
            autoComplete="new-password"
            error={confirmationError}
            id={`${idPrefix}-confirm-password`}
            value={confirmation}
            onChange={setConfirmation}
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? (
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          ) : (
            <i className="bi bi-key me-2" aria-hidden="true" />
          )}
          Aggiorna password
        </button>
      </form>
    </section>
  );
}
