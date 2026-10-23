import { clearAuthCookie, authenticate } from '../_lib/auth.js';
import { logAudit } from '../_lib/audit.js';

export default async function handler(req, res) {
  try {
    let userId = 'ANONYMOUS';
    try {
      const authUser = await authenticate(req);
      userId = authUser.id;
    } catch (e) {}

    clearAuthCookie(res);
    if (userId !== 'ANONYMOUS') {
      await logAudit(userId, 'LOGOUT', {});
    }

    return res.status(200).json({ ok: true, message: 'Berhasil logout' });
  } catch (err) {
    clearAuthCookie(res);
    return res.status(200).json({ ok: true, message: 'Berhasil logout' });
  }
}
