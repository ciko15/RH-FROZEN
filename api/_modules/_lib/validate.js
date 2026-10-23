import { ApiError } from './errors.js';

/**
 * Validasi payload menggunakan skema Zod
 */
export function validateBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue.path.join('.');
    const msg = path ? `Field '${path}': ${firstIssue.message}` : firstIssue.message;
    throw new ApiError(400, 'VALIDATION_ERROR', msg);
  }
  return result.data;
}
