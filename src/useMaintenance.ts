import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { subscribeToMaintenance } from './maintenanceEvents';
import type { MaintenanceStatus } from './types';

const POLL_INTERVAL_MS = 30_000;
const CLOCK_INTERVAL_MS = 1_000;

function clockOffset(status: MaintenanceStatus, receivedAt: number): number {
  const serverTime = Date.parse(status.server_time);
  return Number.isFinite(serverTime) ? serverTime - receivedAt : 0;
}

export interface MaintenanceMonitor {
  status: MaintenanceStatus | null;
  initialized: boolean;
  unavailable: boolean;
  remainingMilliseconds: number | null;
  refresh: () => Promise<void>;
}

export function useMaintenance(): MaintenanceMonitor {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const acceptStatus = useCallback((next: MaintenanceStatus) => {
    const receivedAt = Date.now();
    setStatus(next);
    setOffset(clockOffset(next, receivedAt));
    setNow(receivedAt);
    setUnavailable(false);
    setInitialized(true);
  }, []);

  const refresh = useCallback(async () => {
    try {
      acceptStatus(await api.maintenanceStatus());
    } catch {
      setUnavailable(true);
      setInitialized(true);
    }
  }, [acceptStatus]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const refreshOnFocus = () => void refresh();
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [refresh]);

  useEffect(() => subscribeToMaintenance(acceptStatus), [acceptStatus]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const derived = useMemo(() => {
    if (!status?.starts_at || status.state === 'available') {
      return { status, remainingMilliseconds: null };
    }
    const startsAt = Date.parse(status.starts_at);
    const remaining = Number.isFinite(startsAt)
      ? Math.max(0, startsAt - (now + offset))
      : 0;
    if (status.state === 'scheduled' && remaining === 0) {
      return {
        status: {
          ...status,
          state: 'active' as const,
          api_available: false,
          login_allowed: false,
        },
        remainingMilliseconds: 0,
      };
    }
    return { status, remainingMilliseconds: remaining };
  }, [now, offset, status]);

  return {
    status: derived.status,
    initialized,
    unavailable,
    remainingMilliseconds: derived.remainingMilliseconds,
    refresh,
  };
}
