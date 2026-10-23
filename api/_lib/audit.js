import { appendRow } from './sheets.js';
import crypto from 'crypto';

export async function logAudit(userId, action, detail) {
  try {
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const id = crypto.randomUUID();

    await appendRow('AuditLog', {
      id,
      date_time: dateStr,
      user_id: userId || 'SYSTEM',
      action,
      detail_json: typeof detail === 'string' ? detail : JSON.stringify(detail)
    }, ['id', 'date_time', 'user_id', 'action', 'detail_json']);
  } catch (err) {
    console.error('AuditLog error:', err.message);
  }
}
