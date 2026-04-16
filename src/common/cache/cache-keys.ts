/**
 * Redis key families for invoice read cache-aside (FR43, NFR-C2).
 *
 * - `user:{userId}:dashboard:summary` — aggregated dashboard DTO (no PDFs).
 * - `user:{userId}:invoices:list` — full invoice list payload (includes drafts; short TTL).
 * - `user:{userId}:invoices:list:*` — reserved for future filtered list variants; use delPattern.
 * - `user:{userId}:invoice:{invoiceId}` — single invoice with lines (stable statuses only).
 */
export function dashboardSummaryKey(userId: string): string {
  return `user:${userId}:dashboard:summary`;
}

export function invoiceListKey(userId: string): string {
  return `user:${userId}:invoices:list`;
}

/** Pattern covering list key and future `invoices:list:*` variants. */
export function invoiceListKeyPattern(userId: string): string {
  return `user:${userId}:invoices:list*`;
}

export function invoiceDetailKey(userId: string, invoiceId: string): string {
  return `user:${userId}:invoice:${invoiceId}`;
}

/** Pattern for all per-invoice detail keys for a tenant. */
export function invoiceDetailKeyPattern(userId: string): string {
  return `user:${userId}:invoice:*`;
}
