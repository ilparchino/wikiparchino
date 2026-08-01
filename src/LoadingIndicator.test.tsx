import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingIndicator } from './LoadingIndicator';

describe('LoadingIndicator', () => {
  afterEach(cleanup);

  it.each(['page', 'section'] as const)('centers the visible pulsing-logo %s loading state', (variant) => {
    const { container } = render(<LoadingIndicator variant={variant} appearance="logo" />);

    const indicator = screen.getByRole('status', { name: 'Caricamento...' });
    expect(indicator).toHaveClass('loading-indicator', `loading-indicator-${variant}`);
    expect(screen.getByText('Caricamento...')).not.toHaveClass('visually-hidden');
    expect(container.querySelector('.loading-indicator-logo')).toBeInTheDocument();
    expect(container.querySelector('.spinner-border')).not.toBeInTheDocument();
  });

  it('uses the Bootstrap ring by default for a centered media state', () => {
    const { container } = render(
      <LoadingIndicator
        variant="media"
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
    expect(container.querySelector('.spinner-border')).toBeInTheDocument();
    expect(container.querySelector('.loading-indicator-logo')).not.toBeInTheDocument();
  });
});
