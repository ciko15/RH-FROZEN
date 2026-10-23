import { ApiError } from './errors.js';
import { clearCache } from './cache.js';

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET;

/**
 * Memanggil fungsi transaksi atomik di Google Apps Script Web App
 */
export async function callGas(action, payload = {}) {
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SECRET) {
    throw new ApiError(500, 'GAS_CONFIG_ERROR', 'URL atau Secret Google Apps Script belum diatur');
  }

  const bodyData = {
    secret: APPS_SCRIPT_SECRET,
    action,
    payload
  };

  let response;
  try {
    response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData),
      redirect: 'follow'
    });
  } catch (err) {
    throw new ApiError(502, 'GAS_CONNECTION_ERROR', 'Gagal terhubung ke Google Apps Script: ' + err.message);
  }

  let rawText = '';
  let result;
  try {
    rawText = await response.text();
    result = JSON.parse(rawText);
  } catch (err) {
    if (rawText.includes('<title>Halaman Tidak Ditemukan</title>') || rawText.includes('Maaf, saat ini tidak dapat membuka file')) {
      throw new ApiError(502, 'GAS_DEPLOY_ERROR', 'Google Apps Script belum di-deploy sebagai Web App dengan izin akses "Siapa Saja (Anyone)".');
    }
    throw new ApiError(502, 'GAS_INVALID_RESPONSE', 'Google Apps Script merespons bukan dalam format JSON: ' + rawText.substring(0, 100));
  }

  if (!result.ok) {
    throw new ApiError(400, result.error || 'TRANSACTION_FAILED', result.message || 'Transaksi gagal diproses');
  }

  // Setiap penulisan via GAS berpotensi mengubah data transaksi & stok, bersihkan cache
  clearCache();

  return result.data;
}
