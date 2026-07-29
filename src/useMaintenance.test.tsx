import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { useMaintenance } from './useMaintenance';
import type { MaintenanceStatus } from './types';


function Harness() {
  const maintenance = useMaintenance();
  return (
    <div>
      <span data-testid="state">{maintenance.status?.state ?? 'unknown'}</span>
      <span data-testid="initialized">{String(maintenance.initialized)}</span>
    </div>
  );
}


describe('useMaintenance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T10:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses the server clock and activates locally at the deadline', async () => {
    const scheduled: MaintenanceStatus = {
      state: 'scheduled',
      server_time: '2026-07-29T10:00:00Z',
      announced_at: '2026-07-29T10:00:00Z',
      starts_at: '2026-07-29T10:00:02Z',
      message: null,
      login_allowed: false,
      api_available: true,
    };
    vi.spyOn(api, 'maintenanceStatus').mockResolvedValue(scheduled);

    render(<Harness />);
    await act(async () => undefined);
    expect(screen.getByTestId('state')).toHaveTextContent('scheduled');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('active');
  });

  it('polls every thirty seconds and refreshes when the window regains focus', async () => {
    const available: MaintenanceStatus = {
      state: 'available',
      server_time: '2026-07-29T10:00:00Z',
      announced_at: null,
      starts_at: null,
      message: null,
      login_allowed: true,
      api_available: true,
    };
    const status = vi.spyOn(api, 'maintenanceStatus').mockResolvedValue(available);

    render(<Harness />);
    await act(async () => undefined);
    expect(status).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(status).toHaveBeenCalledTimes(2);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(status).toHaveBeenCalledTimes(3);
  });
});
