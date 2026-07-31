import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingIndicator } from './LoadingIndicator';

describe('LoadingIndicator', () => {
  afterEach(cleanup);

  it.each(['page', 'section'] as const)('centers the visible %s loading state', (variant) => {
    const { container } = render(<LoadingIndicator variant={variant} />);

    const indicator = screen.getByRole('status', { name: 'Caricamento...' });
    expect(indicator).toHaveClass('loading-indicator', `loading-indicator-${variant}`);
    expect(screen.getByText('Caricamento...')).not.toHaveClass('visually-hidden');
    expect(container.querySelector('.loading-indicator-logo')).toBeInTheDocument();
    expect(container.querySelector('.spinner-border')).not.toBeInTheDocument();
  });

  it('uses a centered Bootstrap media state with an accessible hidden label', () => {
    const { container } = render(
      <LoadingIndicator
        variant="media"
        appearance="bootstrap"
        label="Caricamento immagine 1 di 2"
      />,
    );

    const indicator = screen.getByRole('status', { name: 'Caricamento immagine 1 di 2' });
    expect(indicator).toHaveClass('loading-indicator-media');
    expect(screen.getByText('Caricamento immagine 1 di 2')).toHaveClass('visually-hidden');
    expect(container.querySelector('.spinner-border')).toBeInTheDocument();
    expect(container.querySelector('.loading-indicator-logo')).not.toBeInTheDocument();
  });

  it('keeps compact action loading labels available without adding a live region', () => {
    const { container } = render(<LoadingIndicator variant="inline" label="Salvataggio" />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Salvataggio')).toHaveClass('visually-hidden');
    expect(container.querySelector('.loading-indicator-inline')).toBeInTheDocument();
    expect(container.querySelector('.loading-indicator-logo')).toBeInTheDocument();
  });
});
