/**
 * Fetch wrapper untuk pemanggilan API terpadu
 */
export async function apiFetch(endpoint, options = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json'
  };

  const config = {
    ...options,
    credentials: 'include', // Kirim cookie sesi httpOnly
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  };

  if (!navigator.onLine) {
    const err = new Error('Tidak ada koneksi internet');
    err.isOffline = true;
    throw err;
  }

  const response = await fetch(endpoint, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || 'Terjadi kesalahan sistem');
    error.status = response.status;
    error.code = data.error;

    if (response.status === 401 && !endpoint.includes('/api/auth/login') && !endpoint.includes('/api/auth/me')) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    } else if (response.status === 403 && data.error === 'MUST_CHANGE_PASSWORD') {
      window.dispatchEvent(new CustomEvent('auth:must_change_password'));
    }

    throw error;
  }

  return data;
}
