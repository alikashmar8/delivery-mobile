import type { ApiSchemas } from "../api/api-client";

export type PendingOperation = {
  ownerId: string;
  deliveryId: string;
} & (
  | {
      kind: "action";
      key: string;
      photoUri?: string;
      body: ApiSchemas["DeliveryActionDto"];
    }
  | { kind: "payment"; body: ApiSchemas["DeliveryPaymentDto"] }
  | {
      kind: "photo";
      uploadId: string;
      expectedVersion: number;
      uri: string | null;
      uploaded: boolean;
    }
);

// A single in-flight operation, not a background offline queue. Persist before any write.
export interface PendingStorage {
  read(ownerId: string): Promise<string | null>;
  write(ownerId: string, value: string): Promise<void>;
  remove(ownerId: string): Promise<void>;
}

export async function readPending(
  storage: PendingStorage,
  ownerId: string,
): Promise<PendingOperation | null> {
  const raw = await storage.read(ownerId);
  if (!raw) return null;
  const invalid = () =>
    new Error(
      "Pending work could not be restored safely. Do not record the payment again; contact operations.",
    );
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  const record = (input: unknown): input is Record<string, unknown> =>
    !!input && typeof input === "object" && !Array.isArray(input);
  const text = (input: unknown): input is string =>
    typeof input === "string" && input.length > 0;
  const version = (input: unknown) =>
    typeof input === "number" && Number.isSafeInteger(input) && input > 0;
  if (!record(value) || value.ownerId !== ownerId || !text(value.deliveryId))
    throw invalid();
  if (value.kind === "photo") {
    if (
      !text(value.uploadId) ||
      !version(value.expectedVersion) ||
      !(value.uri === null || text(value.uri)) ||
      typeof value.uploaded !== "boolean" ||
      (value.uploaded && !value.uri)
    )
      throw invalid();
  } else if (value.kind === "payment" || value.kind === "action") {
    if (!record(value.body) || !version(value.body.expectedVersion))
      throw invalid();
    if (value.kind === "payment") {
      if (
        !text(value.body.receiptId) ||
        !text(value.body.amount) ||
        !/^[1-9][0-9]{0,18}$/.test(value.body.amount)
      )
        throw invalid();
    } else if (
      !text(value.key) ||
      ![
        "ACCEPTED",
        "PICKED_UP",
        "IN_TRANSIT",
        "ARRIVED",
        "DELIVERED",
        "FAILED",
        "RETURNED",
      ].includes(String(value.body.toStatus)) ||
      !(value.photoUri === undefined || text(value.photoUri))
    )
      throw invalid();
  } else throw invalid();
  return value as PendingOperation;
}

export async function persistPending(
  storage: PendingStorage,
  operation: PendingOperation,
): Promise<void> {
  await storage.write(operation.ownerId, JSON.stringify(operation));
}

export async function sendPending(
  storage: PendingStorage,
  operation: Exclude<PendingOperation, { kind: "photo" }>,
  send: (
    operation: Exclude<PendingOperation, { kind: "photo" }>,
  ) => Promise<unknown>,
): Promise<void> {
  await persistPending(storage, operation);
  await send(operation);
  // Failure or process death before this removal retains exactly the same replay payload.
  await storage.remove(operation.ownerId);
}

export function cashAmount(input: string, outstanding: string): string {
  if (
    !/^[1-9][0-9]{0,18}$/.test(input) ||
    BigInt(input) > BigInt(outstanding)
  ) {
    throw new Error(
      "Enter positive USD cents no greater than the outstanding cash.",
    );
  }
  return input;
}

export function usd(amount: string): string {
  const value = BigInt(amount);
  return `$${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

export const nextDriverAction: Partial<
  Record<
    ApiSchemas["DeliveryResponseDto"]["status"],
    { status: ApiSchemas["DeliveryActionDto"]["toStatus"]; label: string }
  >
> = {
  ASSIGNED: { status: "ACCEPTED", label: "Accept delivery" },
  ACCEPTED: { status: "PICKED_UP", label: "Confirm pickup" },
  PICKED_UP: { status: "IN_TRANSIT", label: "Start delivery" },
  IN_TRANSIT: { status: "ARRIVED", label: "Confirm arrival" },
  RESCHEDULED: { status: "IN_TRANSIT", label: "Start delivery" },
};
