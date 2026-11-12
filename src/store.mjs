import Dexie from '../vendor/dexie.mjs';

export const db = new Dexie('repairdesk-local');
db.version(1).stores({ jobs: 'id, status, createdAt, updatedAt, deliveredAt, customerName, customerPhone', expenses: 'id, date, category', parts: 'id, name, quantity', settings: 'id' });

export async function appSettings() {
  return (await db.settings.get('app')) || { id:'app', currency:'PKR', privacyRedact:false };
}
export async function saveSettings(patch) {
  const current = await appSettings();
  await db.settings.put({ ...current, ...patch, id:'app' });
  return appSettings();
}
export async function setupPin(pin) {
  if (!/^\d{4,12}$/.test(pin)) throw new Error('Use 4 to 12 digits for the PIN.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt);
  const previous = await appSettings();
  await db.settings.put({ ...previous, id:'app', pinSalt:toB64(salt), pinHash:toB64(hash), pinIterations:310000 });
}
export async function hasPin() { return Boolean((await appSettings()).pinHash); }
export async function verifyPin(pin) {
  const settings = await appSettings();
  if (!settings.pinHash || !settings.pinSalt) return false;
  const hash = await derive(pin, fromB64(settings.pinSalt), settings.pinIterations || 310000);
  const expected = fromB64(settings.pinHash);
  return hash.length === expected.length && hash.every((v,i) => v === expected[i]);
}
async function derive(pin, salt, iterations=310000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations,hash:'SHA-256'}, key, 256));
}
function toB64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function fromB64(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

export async function snapshot() {
  return db.transaction('r', db.jobs, db.expenses, db.parts, db.settings, async () => {
    const [jobs, expenses, parts, settings] = await Promise.all([db.jobs.toArray(), db.expenses.toArray(), db.parts.toArray(), appSettings()]);
    const { pinSalt, pinHash, pinIterations, ...safeSettings } = settings;
    return { app:'repairdesk', version:1, exportedAt:new Date().toISOString(), data:{jobs,expenses,parts,settings:safeSettings} };
  });
}
export async function replaceData(data) {
  return db.transaction('rw', db.jobs, db.expenses, db.parts, db.settings, async () => {
    const current = await appSettings();
    await Promise.all([db.jobs.clear(),db.expenses.clear(),db.parts.clear()]);
    await Promise.all([db.jobs.bulkPut(data.jobs),db.expenses.bulkPut(data.expenses),db.parts.bulkPut(data.parts)]);
    await db.settings.put({ ...current, ...data.settings, id:'app', pinSalt:current.pinSalt, pinHash:current.pinHash, pinIterations:current.pinIterations });
  });
}
export async function addDemoData(fixtures) {
  return db.transaction('rw', db.jobs, db.expenses, db.parts, async () => {
    await Promise.all([db.jobs.bulkPut(fixtures.jobs),db.expenses.bulkPut(fixtures.expenses),db.parts.bulkPut(fixtures.parts)]);
  });
}
