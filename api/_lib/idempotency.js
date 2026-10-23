import { getTabRows, appendRow } from './sheets.js';

/**
 * Pengecekan Idempotency-Key
 */
export async function checkIdempotency(key) {
  if (!key) return null;
  const rows = await getTabRows('Idempotency');
  const record = rows.find(r => r.key === key);
  if (record && record.response_json) {
    try {
      return JSON.parse(record.response_json);
    } catch (e) {
      return null;
    }
  }
  return null;
}

export async function saveIdempotency(key, responseData) {
  if (!key) return;
  const now = new Date().toISOString();
  await appendRow('Idempotency', {
    key,
    response_json: JSON.stringify(responseData),
    created_at: now
  }, ['key', 'response_json', 'created_at']);
}
