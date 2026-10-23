import { authenticate } from '../../_lib/auth.js';
import { callGas } from '../../_lib/gas.js';
import { handleApiError, ApiError } from '../../_lib/errors.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const invoiceId = req.query.id;

    if (!invoiceId) {
      throw new ApiError(400, 'BAD_REQUEST', 'ID Invoice wajib disertakan');
    }

    // Panggil GAS generator PDF
    const pdfResult = await callGas('invoicePdf', { invoice_id: invoiceId });

    return res.status(200).json({
      ok: true,
      data: pdfResult
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
