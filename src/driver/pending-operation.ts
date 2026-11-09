import type { ApiSchemas } from '../api/api-client';

export type PendingOperation = {
  ownerId: string;
  deliveryId: string;
} & (
  | { kind: 'action'; key: string; photoUri?: string; body: ApiSchemas['DeliveryActionDto'] }
  | { kind: 'payment'; body: ApiSchemas['DeliveryPaymentDto'] }
  | { kind: 'photo'; uploadId: string; expectedVersion: number; uri: string | null; uploaded: boolean }
);

// A single in-flight operation, not a background offline queue. Persist before any write.
export interface PendingStorage {
  read(ownerId: string): Promise<string | null>;
  write(ownerId: string, value: string): Promise<void>;
  remove(ownerId: string): Promise<void>;
}

export async function readPending(storage: PendingStorage, ownerId: string): Promise<PendingOperation | null> {
  const raw = await storage.read(ownerId);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('ownerId' in value) || value.ownerId !== ownerId ||
      !('deliveryId' in value) || typeof value.deliveryId !== 'string' || !('kind' in value) ||
      !['action', 'payment', 'photo'].includes(String(value.kind))) {
    throw new Error('Pending work could not be restored safely. Do not record the payment again; contact operations.');
  }
  return value as PendingOperation;
}

export async function persistPending(storage: PendingStorage, operation: PendingOperation): Promise<void> {
  await storage.write(operation.ownerId, JSON.stringify(operation));
}

export async function sendPending(
  storage: PendingStorage,
  operation: Exclude<PendingOperation, { kind: 'photo' }>,
  send: (operation: Exclude<PendingOperation, { kind: 'photo' }>) => Promise<unknown>,
): Promise<void> {
  await persistPending(storage, operation);
  await send(operation);
  // Failure or process death before this removal retains exactly the same replay payload.
  await storage.remove(operation.ownerId);
}

export function cashAmount(input: string, outstanding: string): string {
  if (!/^[1-9][0-9]{0,18}$/.test(input) || BigInt(input) > BigInt(outstanding)) {
    throw new Error('Enter positive USD cents no greater than the outstanding cash.');
  }
  return input;
}

export function usd(amount: string): string {
  const value = BigInt(amount);
  return `$${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

export const nextDriverAction: Partial<Record<ApiSchemas['DeliveryResponseDto']['status'],
  { status: ApiSchemas['DeliveryActionDto']['toStatus']; label: string }>> = {
  ASSIGNED: { status: 'ACCEPTED', label: 'Accept delivery' },
  ACCEPTED: { status: 'PICKED_UP', label: 'Confirm pickup' },
  PICKED_UP: { status: 'IN_TRANSIT', label: 'Start delivery' },
  IN_TRANSIT: { status: 'ARRIVED', label: 'Confirm arrival' },
  RESCHEDULED: { status: 'IN_TRANSIT', label: 'Start delivery' },
};
