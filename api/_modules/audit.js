import { authenticate } from './_lib/auth.js';
import { requireRole } from './_lib/rbac.js';
import { getTabRows } from './_lib/sheets.js';
import { handleApiError } from './_lib/errors.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin']);

    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 50);

    const logs = await getTabRows('AuditLog');
    // Urutkan dari yang terbaru
    logs.reverse();

    const total = logs.length;
    const startIndex = (page - 1) * limit;
    const paginated = logs.slice(startIndex, startIndex + limit);

    return res.status(200).json({
      ok: true,
      data: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
