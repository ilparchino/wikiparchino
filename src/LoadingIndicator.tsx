export type LoadingIndicatorVariant = 'page' | 'section' | 'media' | 'inline';
export type LoadingIndicatorAppearance = 'logo' | 'bootstrap';

const loadingLogo = `${import.meta.env.BASE_URL}brand/logo-mono.png`;

export function LoadingIndicator({
  variant = 'section',
  label = 'Caricamento...',
  appearance = 'logo',
}: {
  variant?: LoadingIndicatorVariant;
  label?: string;
  appearance?: LoadingIndicatorAppearance;
}) {
  const showLabel = variant === 'page' || variant === 'section';
  const announce = variant !== 'inline';

  return (
    <span
      className={`loading-indicator loading-indicator-${variant}`}
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
      aria-label={announce ? label : undefined}
    >
      {appearance === 'bootstrap' ? (
        <span
          className="loading-indicator-visual loading-indicator-bootstrap spinner-border"
          aria-hidden="true"
        />
      ) : (
        <span className="loading-indicator-visual" aria-hidden="true">
          <img className="loading-indicator-logo" src={loadingLogo} alt="" />
        </span>
      )}
      <span className={showLabel ? 'loading-indicator-label' : 'visually-hidden'}>
        {label}
      </span>
    </span>
  );
}
