import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Link } from 'expo-router';
import { apiClient, type ApiSchemas } from '@/api';
import { ThemedText } from '@/components/themed-text';
import { useSession } from './session';
import { pendingStorage } from './storage';
import { readPending, usd } from './pending-operation';
import { Action, Field, Notice, Screen, Section, errorMessage } from './ui';

export default function DriverHome() {
  const session = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otp, setOtp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<ApiSchemas['DriverProfileResponseDto'] | null>(null);
  const [page, setPage] = useState<ApiSchemas['PaginatedDeliverySummaryResponseDto'] | null>(null);
  const [skip, setSkip] = useState(0);
  const [awaitingCash, setAwaitingCash] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const user = session.user;
  const load = useCallback(async () => {
    if (!user?.driverProfile) return;
    setBusy(true); setError(null); setPage(null);
    try {
      const current = await apiClient.requestContract('/drivers/me', 'get');
      setProfile(current);
      const pending = await readPending(pendingStorage, user.id);
      setPendingId(pending?.deliveryId ?? null);
      if (!current.active) return;
      setPage(await apiClient.request<ApiSchemas['PaginatedDeliverySummaryResponseDto']>(awaitingCash
        ? `/deliveries?driverId=${encodeURIComponent(current.id)}&status=DELIVERED&take=20&skip=${skip}`
        : `/drivers/me/deliveries?take=20&skip=${skip}`));
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }, [user, skip, awaitingCash]);
  // Initial server/storage synchronization needs a loading state before the asynchronous read.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  async function signIn() {
    setBusy(true); setError(null);
    try {
      const tokens = otp
        ? await apiClient.requestContract('/auth/login/otp', 'post', { auth: 'none', json: { phone, code } })
        : await apiClient.requestContract('/auth/login/password', 'post', { auth: 'none', json: { email, password } });
      setPassword(''); setCode('');
      await session.login(tokens);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function sendCode() {
    setBusy(true); setError(null);
    try {
      await apiClient.requestContract('/auth/otp/send', 'post', { auth: 'none', json: { phone } });
      setNotice('Code requested. Enter the code received on your phone.');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function availability() {
    if (!profile) return;
    setBusy(true); setError(null);
    try {
      await apiClient.requestContract('/drivers/me/availability', 'post', { json: {
        availability: profile.availability === 'online' ? 'offline' : 'online', expectedVersion: profile.version,
      } });
      await load();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  if (session.loading) return <Screen><ActivityIndicator accessibilityLabel="Restoring session" /></Screen>;
  if (!user) return <Screen>
    <Section title="Driver sign in">
      <ThemedText>Use your existing Delivery Platform account.</ThemedText>
      {otp ? <>
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
        <Action title="Request code" disabled={busy || !phone} onPress={() => void sendCode()} />
        <Field label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="sms-otp" />
      </> : <>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      </>}
      <Action title={busy ? 'Signing in…' : 'Sign in'} disabled={busy || (otp ? !phone || !code : !email || !password)} onPress={() => void signIn()} />
      <Action title={otp ? 'Use email and password' : 'Use phone code'} disabled={busy} onPress={() => { setOtp(!otp); setError(null); setNotice(null); }} />
      <Notice text={error ?? session.error} /><Notice text={notice} />
      {session.error ? <Action title="Retry saved session" disabled={busy} onPress={() => void session.restore()} /> : null}
    </Section>
  </Screen>;
  if (!user.driverProfile) return <Screen><Section title="Driver access required">
    <ThemedText>{user.displayName}, this account has no driver profile. Ask operations to onboard your account.</ThemedText>
    <Action title="Check access again" onPress={() => void session.restore()} />
    <Action title="Sign out" onPress={() => void session.logout()} /><Notice text={session.error} />
  </Section></Screen>;
  return <Screen>
    <Section title={user.displayName}>
      <ThemedText>{profile?.active ? `Availability: ${profile.availability.replaceAll('_', ' ')}` : 'Awaiting driver approval'}</ThemedText>
      {profile?.active && profile.availability !== 'on_delivery' ? <Action title={profile.availability === 'online' ? 'Go offline' : 'Go online'} disabled={busy} onPress={() => void availability()} /> : null}
      <Action title="Refresh deliveries" disabled={busy} onPress={() => void load()} />
      <Action title="Sign out" disabled={busy} onPress={() => void session.logout()} />
      <Notice text={error ?? session.error} />
    </Section>
    {pendingId ? <Link href={{ pathname: '/driver/[id]', params: { id: pendingId } }}>Resume pending work</Link> : null}
    <View accessibilityRole="tablist">
      <Action title={awaitingCash ? 'Show active deliveries' : 'Show delivered with cash outstanding'} disabled={busy} onPress={() => { setSkip(0); setAwaitingCash(!awaitingCash); }} />
    </View>
    <Section title={awaitingCash ? 'Delivered · awaiting cash' : 'Your active deliveries'}>
      {busy ? <ActivityIndicator accessibilityLabel="Loading deliveries" /> : null}
      {!busy && page?.items.length === 0 ? <ThemedText>{awaitingCash ? 'No delivered jobs awaiting cash.' : 'No active assignments. Go online to receive an assignment.'}</ThemedText> : null}
      {page?.items.map((delivery) => <Section key={delivery.id} title={delivery.trackingCode}>
        <ThemedText>{delivery.status.replaceAll('_', ' ')} · {delivery.businessId ? 'Business' : 'Personal'}</ThemedText>
        <ThemedText>Delivery fee {usd(delivery.deliveryFee)} USD</ThemedText>
        <Link href={{ pathname: '/driver/[id]', params: { id: delivery.id } }}>Open delivery {delivery.trackingCode}</Link>
      </Section>)}
      <Action title="Previous page" disabled={busy || skip === 0} onPress={() => setSkip(Math.max(0, skip - 20))} />
      <Action title="Next page" disabled={busy || !page || page.items.length < 20} onPress={() => setSkip(skip + 20)} />
    </Section>
  </Screen>;
}
