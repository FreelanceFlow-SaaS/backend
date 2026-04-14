/**
 * Log field vocabulary for **background jobs** (email queue, future workers).
 * HTTP requests use pino-http (`requestId`, `route`, `httpStatus`); jobs should
 * emit the same `service` value and use `jobId` as the correlation extension.
 * Never attach raw email HTML, PDF buffers, or invoice line arrays — at most
 * `invoiceId` / `userId` for support correlation.
 */
export function jobLogFields(
  jobId: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    service: 'freelanceflow-api',
    jobId,
    ...extra,
  };
}
