import { Prisma } from '@prisma/client';

const DECIMAL_TAG = '__ffDecimal';
const DATE_TAG = '__ffDate';

function isDecimalLike(value: unknown): value is Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return true;
  if (value === null || typeof value !== 'object') return false;
  const c = (value as { constructor?: { name?: string } }).constructor?.name;
  return (
    c === 'Decimal' && typeof (value as { toFixed?: (n?: number) => string }).toFixed === 'function'
  );
}

/** Deep clone for JSON: replaces Decimal/Date so JSON.stringify never applies Decimal.toJSON first. */
function mapForStorage(value: unknown): unknown {
  if (value instanceof Date) {
    return { [DATE_TAG]: value.toISOString() };
  }
  if (isDecimalLike(value)) {
    return { [DECIMAL_TAG]: value.toFixed() };
  }
  if (Array.isArray(value)) {
    return value.map((v) => mapForStorage(v));
  }
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = mapForStorage(o[k]);
    }
    return out;
  }
  return value;
}

function reviveTaggedDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => reviveTaggedDeep(v));
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o[DECIMAL_TAG] === 'string') {
      return new Prisma.Decimal(o[DECIMAL_TAG]);
    }
    if (typeof o[DATE_TAG] === 'string') {
      return new Date(o[DATE_TAG] as string);
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = reviveTaggedDeep(o[k]);
    }
    return out;
  }
  return value;
}

export function stringifyInvoicePayload(value: unknown): string {
  return JSON.stringify(mapForStorage(value));
}

export function parseInvoicePayload<T>(raw: string): T {
  return reviveTaggedDeep(JSON.parse(raw)) as T;
}
