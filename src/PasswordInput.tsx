import { useEffect, useRef, useState } from 'react';

type PasswordInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  describedBy?: string;
  disabled?: boolean;
  error?: string | null;
  required?: boolean;
};

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  describedBy,
  disabled = false,
  error = null,
  required = false,
}: PasswordInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  const descriptionIds = [describedBy, error ? errorId : null]
    .filter(Boolean)
    .join(' ') || undefined;
  const toggleLabel = visible ? 'Nascondi password' : 'Mostra password';

  useEffect(() => {
    if (value.length === 0) setVisible(false);
  }, [value]);

  function toggleVisibility() {
    setVisible((current) => !current);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className={`input-group${error ? ' has-validation' : ''}`}>
      <input
        aria-describedby={descriptionIds}
        aria-invalid={error ? true : undefined}
        autoComplete={autoComplete}
        className={`form-control${error ? ' is-invalid' : ''}`}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        ref={inputRef}
        required={required}
        type={visible ? 'text' : 'password'}
        value={value}
      />
      <button
        aria-controls={id}
        aria-label={toggleLabel}
        aria-pressed={visible}
        className="btn btn-outline-secondary password-visibility-toggle"
        disabled={disabled}
        onClick={toggleVisibility}
        title={toggleLabel}
        type="button"
      >
        <i className={`bi ${visible ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
      </button>
      {error && <div className="invalid-feedback" id={errorId}>{error}</div>}
    </div>
  );
}
