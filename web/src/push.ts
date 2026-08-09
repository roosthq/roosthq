import { api } from './api';

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

function register(): Promise<ServiceWorkerRegistration> {
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register('/sw.js');
  }
  return registrationPromise;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await register();
  return reg.pushManager.getSubscription();
}

// Requests browser permission (if not already granted/denied), subscribes,
// and registers the subscription with the server. Throws on denial/failure -
// callers should surface that via the Dialog, not swallow it silently.
export async function subscribeToPush(): Promise<void> {
  if (!pushSupported()) throw new Error('Push notifications are not supported in this browser.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const { key } = await api.pushPublicKey();
  if (!key) throw new Error('Push notifications are not configured on the server yet.');

  const reg = await register();
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Subscription is missing required fields.');
  await api.subscribePush({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await api.unsubscribePush(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}
