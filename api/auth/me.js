import { authenticate } from '../_lib/auth.js';
import { handleApiError } from '../_lib/errors.js';

export default async function handler(req, res) {
  try {
    const user = await authenticate(req);
    return res.status(200).json({
      ok: true,
      data: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        branch_id: user.branch_id,
        must_change_password: user.must_change_password
      }
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
