export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendError(res, status, code, message) {
  return res.status(status).json({
    error: code,
    message: message
  });
}

export function handleApiError(res, err) {
  if (err instanceof ApiError) {
    return sendError(res, err.status, err.code, err.message);
  }
  console.error('[API_ERROR]', err);
  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Terjadi kesalahan pada server. Silakan coba beberapa saat lagi.');
}
