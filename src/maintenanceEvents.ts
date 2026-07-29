import type { MaintenanceStatus } from './types';

const listeners = new Set<(status: MaintenanceStatus) => void>();

export function publishMaintenance(status: MaintenanceStatus): void {
  listeners.forEach((listener) => listener(status));
}

export function subscribeToMaintenance(
  listener: (status: MaintenanceStatus) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isMaintenanceStatus(value: unknown): value is MaintenanceStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<MaintenanceStatus>;
  return (
    (status.state === 'available'
      || status.state === 'scheduled'
      || status.state === 'active')
    && typeof status.server_time === 'string'
    && (status.starts_at === null || typeof status.starts_at === 'string')
    && (status.announced_at === null || typeof status.announced_at === 'string')
    && (status.message === null || typeof status.message === 'string')
    && typeof status.login_allowed === 'boolean'
    && typeof status.api_available === 'boolean'
  );
}
