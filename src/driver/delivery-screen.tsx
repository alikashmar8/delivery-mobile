import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { File } from 'expo-file-system';
import { uuid } from 'expo-modules-core';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { apiClient, ApiError, type ApiSchemas } from '@/api';
import { captureProofPhoto, uploadProofPhoto } from '@/api/proof-of-delivery';
import { ThemedText } from '@/components/themed-text';
import { useSession } from './session';
import { pendingStorage, removePhoto, retainPhoto, savedPhoto } from './storage';
import { cashAmount, nextDriverAction, persistPending, readPending, sendPending, usd, type PendingOperation } from './pending-operation';
import { Action, Field, Notice, Screen, Section, errorMessage } from './ui';

const reasons = [
  ['not_answered', 'No answer'], ['wrong_address', 'Wrong address'],
  ['reschedule_requested', 'Reschedule requested'], ['refused', 'Refused'],
  ['damaged', 'Damaged'], ['other', 'Other'],
] as const;

export default function DeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const ownerId = session.user?.id;
  const profile = session.user?.driverProfile;
  const [detail, setDetail] = useState<ApiSchemas['DeliveryDetailResponseDto'] | null>(null);
  const [summary, setSummary] = useState<ApiSchemas['PaymentSummaryResponseDto'] | null>(null);
  const [receipts, setReceipts] = useState<ApiSchemas['PaginatedPaymentsResponseDto'] | null>(null);
  const [receiptSkip, setReceiptSkip] = useState(0);
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [amount, setAmount] = useState('');
  const [failure, setFailure] = useState(false);
  const [reasonCode, setReasonCode] = useState<NonNullable<ApiSchemas['DeliveryActionDto']['reasonCode']>>('not_answered');
  const [note, setNote] = useState('');
  const [returnConfirmed, setReturnConfirmed] = useState(false);
  const [proof, setProof] = useState<ApiSchemas['PodDownloadResponseDto'] | null>(null);
  const delivery = detail?.delivery;
  useEffect(() => {
    if (!proof) return;
    const timer = setTimeout(() => setProof(null), Math.max(0, Date.parse(proof.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [proof]);
  const load = useCallback(async () => {
    if (!ownerId || !profile?.active) return;
    setLoaded(false); setError(null); setDetail(null); setProof(null);
    try {
      const restored = await readPending(pendingStorage, ownerId);
      setPending(restored);
      const response = await apiClient.request<ApiSchemas['DeliveryDetailResponseDto']>(`/deliveries/${encodeURIComponent(id)}/details`);
      if (response.delivery.driverId !== profile.id) throw new Error('This delivery is no longer assigned to you. Return to your queue.');
      const [cash, payments] = await Promise.all([
        apiClient.request<ApiSchemas['PaymentSummaryResponseDto']>(`/deliveries/${encodeURIComponent(id)}/payment-summary`),
        apiClient.request<ApiSchemas['PaginatedPaymentsResponseDto']>(`/deliveries/${encodeURIComponent(id)}/payments?take=20&skip=${receiptSkip}`),
      ]);
      setDetail(response); setSummary(cash); setReceipts(payments);
      if (restored?.kind === 'photo' && restored.deliveryId === id && !restored.uri) {
        // The camera activity can outlive the JS process. Recover only for its recorded owner/delivery.
        let file = [savedPhoto(restored.uploadId, 'image/jpeg'), savedPhoto(restored.uploadId, 'image/png')].find((candidate) => candidate.exists);
        if (!file) {
          const result = await ImagePicker.getPendingResultAsync();
          if (result && 'assets' in result && !result.canceled && result.assets?.[0]) {
            file = retainPhoto(restored.uploadId, new File(result.assets[0].uri));
          }
        }
        if (file) {
          const recovered = { ...restored, uri: file.uri };
          await persistPending(pendingStorage, recovered); setPending(recovered);
        }
      }
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setLoaded(true); }
  }, [ownerId, profile, id, receiptSkip]);
  // Initial server/storage synchronization needs a loading state before the asynchronous read.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null); setRejected(false);
    try { await work(); }
    catch (failure) {
      setError(errorMessage(failure));
      setRejected(failure instanceof ApiError && [400, 409].includes(failure.status));
    } finally { lock.current = false; setBusy(false); }
  }
  async function send(operation: Exclude<PendingOperation, { kind: 'photo' }>) {
    if (!ownerId || operation.ownerId !== ownerId || operation.deliveryId !== id) throw new Error('Resume pending work from its original account and delivery.');
    setPending(operation);
    await sendPending(pendingStorage, operation, async (saved) => {
      await apiClient.request<ApiSchemas['DeliveryResponseDto']>(`/deliveries/${encodeURIComponent(id)}/${saved.kind === 'payment' ? 'payments' : 'actions'}`, {
        method: 'POST', json: saved.body,
        ...(saved.kind === 'action' ? { headers: { 'Idempotency-Key': saved.key } } : {}),
      });
    });
    if (operation.kind === 'action' && operation.photoUri) removePhoto(operation.photoUri);
    setPending(null); setAmount(''); setFailure(false); setReturnConfirmed(false);
    setNotice('Saved and confirmed by the server.');
    await load();
  }
  async function action(body: ApiSchemas['DeliveryActionDto'], photoUri?: string) {
    if (!ownerId) return;
    await send({ ownerId, deliveryId: id, kind: 'action', key: uuid.v4(), body, ...(photoUri ? { photoUri } : {}) });
  }
  async function capture() {
    if (!ownerId || !delivery) return;
    const draft: PendingOperation = { ownerId, deliveryId: id, kind: 'photo', uploadId: uuid.v4(), expectedVersion: delivery.version, uri: null, uploaded: false };
    await persistPending(pendingStorage, draft); setPending(draft);
    const file = await captureProofPhoto();
    if (!file) { await pendingStorage.remove(ownerId); setPending(null); return; }
    const saved = retainPhoto(draft.uploadId, file);
    const captured = { ...draft, uri: saved.uri };
    await persistPending(pendingStorage, captured); setPending(captured);
  }
  async function upload() {
    if (pending?.kind !== 'photo' || !pending.uri || !delivery) return;
    // Upload issuance does not mutate delivery version; refresh may safely update its precondition.
    const updated = { ...pending, expectedVersion: delivery.version };
    await persistPending(pendingStorage, updated); setPending(updated);
    await uploadProofPhoto(id, updated.expectedVersion, updated.uploadId, new File(updated.uri!));
    const done = { ...updated, uploaded: true };
    await persistPending(pendingStorage, done); setPending(done);
    setNotice('Photo uploaded. Confirm physical handover when it has occurred.');
  }
  async function discardPhoto() {
    if (!ownerId || pending?.kind !== 'photo') return;
    if (pending.uri) removePhoto(pending.uri);
    await pendingStorage.remove(ownerId); setPending(null);
  }
  if (session.loading) return <Screen><ActivityIndicator /></Screen>;
  if (!ownerId || !profile?.active) return <Screen><ThemedText>Sign in with an approved driver account to open deliveries.</ThemedText><Link href="/">Go to driver sign in</Link></Screen>;
  if (!loaded) return <Screen><ActivityIndicator accessibilityLabel="Loading delivery" /></Screen>;
  if (pending && pending.deliveryId !== id) return <Screen><ThemedText>Resolve your pending request before changing another delivery.</ThemedText><Link href={{ pathname: '/driver/[id]', params: { id: pending.deliveryId } }}>Resume pending work</Link></Screen>;
  if (!delivery || !detail || !summary) return <Screen><Notice text={error} /><Action title="Retry loading delivery" disabled={busy} onPress={() => void run(load)} /><Link href="/">Return to queue</Link></Screen>;
  const next = nextDriverAction[delivery.status];
  const canFail = ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED'].includes(delivery.status);
  const canPay = !['CREATED', 'CANCELLED', 'RETURNED', 'COMPLETED'].includes(delivery.status) && summary.outstandingAmount !== '0';
  return <Screen>
    <Stack.Screen options={{ title: delivery.trackingCode }} />
    <Section title={delivery.status.replaceAll('_', ' ')}>
      <ThemedText>{delivery.businessId ? 'Business delivery' : 'Personal delivery'}</ThemedText>
      <Notice text={notice} /><Notice text={error} />
      {busy ? <ActivityIndicator accessibilityLabel="Saving request" /> : null}
      <Action title="Refresh server state" disabled={busy} onPress={() => void run(load)} />
      {error ? <Action title="Reconnect session" disabled={busy} onPress={() => void session.restore()} /> : null}
    </Section>
    {!pending && next ? <Action title={next.label} disabled={busy} onPress={() => void run(() => action({ toStatus: next.status, expectedVersion: delivery.version }))} /> : null}
    <Section title="Handover cash · USD">
      <ThemedText>Expected {usd(summary.expectedAmount)} · Received {usd(summary.paidAmount)}</ThemedText>
      <ThemedText type="smallBold">Outstanding {usd(summary.outstandingAmount)}</ThemedText>
      <ThemedText>Method: {delivery.paymentMethod}. Record only cash actually received. Completion follows physical handover and full expected cash.</ThemedText>
    </Section>
    {pending && pending.kind !== 'photo' ? <Section title="Request awaiting confirmation">
      <ThemedText>{pending.kind === 'payment' ? `Cash receipt ${usd(pending.body.amount)} USD` : pending.body.toStatus.replaceAll('_', ' ')}. Retry this same request; do not record it again.</ThemedText>
      <Action title="Retry saved request" disabled={busy} onPress={() => void run(() => send(pending))} />
      {rejected ? <Action title="Dismiss rejected request" disabled={busy} onPress={() => void run(async () => { await pendingStorage.remove(ownerId); if (pending.kind === 'action' && pending.photoUri) removePhoto(pending.photoUri); setPending(null); await load(); })} /> : null}
    </Section> : null}
    {delivery.status === 'ARRIVED' && (!pending || pending.kind === 'photo') ? <Section title="Photo proof and handover">
      <ThemedText>Capture a delivery proof photo. Upload it, then confirm physical handover.</ThemedText>
      {!pending ? <Action title="Capture proof photo" disabled={busy} onPress={() => void run(capture)} /> : null}
      {pending?.kind === 'photo' ? <>
        {pending.uri ? <ThemedText>Photo saved on this device.</ThemedText> : <ThemedText>Camera interrupted. Refresh to recover its result, or retake the photo.</ThemedText>}
        <Action title={pending.uploaded ? 'Retry photo upload' : 'Upload saved photo'} disabled={busy || !pending.uri} onPress={() => void run(upload)} />
        {pending.uploaded ? <Action title="Confirm physical handover" disabled={busy} onPress={() => void run(() => action({ toStatus: 'DELIVERED', expectedVersion: delivery.version, uploadId: pending.uploadId }, pending.uri ?? undefined))} /> : null}
        <Action title="Discard photo and retake" disabled={busy} onPress={() => void run(discardPhoto)} />
      </> : null}
    </Section> : null}
    {!pending && canPay ? <Section title="Record received cash">
      <Field label="Cash received in USD cents" keyboardType="number-pad" value={amount} onChangeText={setAmount} maxLength={19} />
      <ThemedText>{/^[0-9]+$/.test(amount) ? `${usd(amount)} USD` : 'For example, 6000 cents is $60.00.'}</ThemedText>
      <Action title="Record cash receipt" disabled={busy || !amount} onPress={() => void run(async () => {
        const value = cashAmount(amount, summary.outstandingAmount);
        await send({ ownerId, deliveryId: id, kind: 'payment', body: { receiptId: uuid.v4(), expectedVersion: delivery.version, amount: value } });
      })} />
    </Section> : null}
    {!pending && canFail ? <Section title="Delivery attempt">
      <Action title={failure ? 'Keep delivering' : 'Record failed attempt'} disabled={busy} onPress={() => setFailure(!failure)} />
      {failure ? <>
        {reasons.map(([code, label]) => <Action key={code} title={`${reasonCode === code ? 'Selected: ' : ''}${label}`} disabled={busy} onPress={() => setReasonCode(code)} />)}
        <Field label="Attempt note (required for Other)" value={note} onChangeText={setNote} maxLength={1000} multiline />
        <Action title="Confirm failed attempt" disabled={busy || (reasonCode === 'other' && !note.trim())} onPress={() => void run(() => action({ toStatus: 'FAILED', expectedVersion: delivery.version, reasonCode, ...(note.trim() ? { note: note.trim() } : {}) }))} />
      </> : null}
    </Section> : null}
    {!pending && delivery.status === 'FAILED' ? <Section title="Return">
      <ThemedText>Operations must explicitly reschedule a retry. Confirm return only after the parcel has been returned. Recorded cash requires operations correction.</ThemedText>
      <Action title={returnConfirmed ? 'Parcel return confirmed' : 'I confirm the parcel was returned'} disabled={busy || summary.paidAmount !== '0'} onPress={() => setReturnConfirmed(!returnConfirmed)} />
      <Action title="Record confirmed return" disabled={busy || !returnConfirmed || summary.paidAmount !== '0'} onPress={() => void run(() => action({ toStatus: 'RETURNED', expectedVersion: delivery.version, returnConfirmed: true }))} />
    </Section> : null}
    {delivery.deliveredAt ? <Section title="Accepted proof">
      <Action title="View authorized proof photo" disabled={busy} onPress={() => void run(async () => { setProof(await apiClient.request<ApiSchemas['PodDownloadResponseDto']>(`/deliveries/${id}/proof`)); })} />
      {proof ? <View><Image source={{ uri: proof.url }} cachePolicy="none" style={{ width: '100%', height: 240 }} accessibilityLabel="Accepted delivery proof" /><ThemedText>Access expires shortly. Request access again to reload.</ThemedText></View> : null}
    </Section> : null}
    <Section title="Pickup">
      <ThemedText selectable>{[detail.pickup.contactName, detail.pickup.city, detail.pickup.street, detail.pickup.building, detail.pickup.floor, detail.pickup.apartment, detail.pickup.landmark, detail.pickup.instructions].filter(Boolean).join('\n')}</ThemedText>
      {detail.pickup.contactPhone ? <Action title={`Call pickup ${detail.pickup.contactPhone}`} disabled={busy} onPress={() => void run(async () => { await Linking.openURL(`tel:${detail.pickup.contactPhone}`); })} /> : null}
    </Section>
    <Section title="Recipient">
      <ThemedText selectable>{[detail.recipient.name, detail.recipient.city, detail.recipient.street, detail.recipient.building, detail.recipient.floor, detail.recipient.apartment, detail.recipient.landmark, detail.recipient.instructions, delivery.notes].filter(Boolean).join('\n')}</ThemedText>
      <Action title={`Call recipient ${detail.recipient.phone}`} disabled={busy} onPress={() => void run(async () => { await Linking.openURL(`tel:${detail.recipient.phone}`); })} />
    </Section>
    <Section title="Recorded cash receipts">
      {receipts?.items.length === 0 ? <ThemedText>No cash receipts recorded.</ThemedText> : null}
      {receipts?.items.map((receipt) => <ThemedText key={receipt.id} selectable>{usd(receipt.amount)} USD · principal {usd(receipt.principalAmount)} · fee {usd(receipt.feeAmount)}{`\n${receipt.occurredAt}`}</ThemedText>)}
      <Action title="Previous receipts" disabled={busy || receiptSkip === 0} onPress={() => setReceiptSkip(Math.max(0, receiptSkip - 20))} />
      <Action title="More receipts" disabled={busy || !receipts || receipts.items.length < 20} onPress={() => setReceiptSkip(receiptSkip + 20)} />
    </Section>
    <Link href="/">Return to queue</Link>
  </Screen>;
}
