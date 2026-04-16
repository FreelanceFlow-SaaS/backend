import { Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { CacheService } from './cache.service';
import {
  dashboardSummaryKey,
  invoiceDetailKey,
  invoiceDetailKeyPattern,
  invoiceListKey,
  invoiceListKeyPattern,
} from './cache-keys';
import { parseInvoicePayload, stringifyInvoicePayload } from './invoice-payload-json';
import type { DashboardSummaryDto } from '../../modules/dashboard/dto/dashboard-summary.dto';

/** Dashboard aggregates — PRD staleness ceiling; invalidation preferred (story 8.3 AC4). */
export const DASHBOARD_SUMMARY_TTL_SEC = 60;

/**
 * Full invoice list includes drafts and line-level financials — short TTL only (AC2).
 * Mutations invalidate before response for read-your-writes (AC4).
 */
export const INVOICE_LIST_TTL_SEC = 25;

/** Stable-band invoice detail (sent / paid / cancelled) — AC3. */
export const INVOICE_DETAIL_STABLE_TTL_SEC = 60;

/**
 * Centralized read cache + invalidation for invoice list, invoice detail (stable), and dashboard summary.
 * Stampede protection: not implemented for MVP (see README).
 */
@Injectable()
export class InvoiceReadCacheService {
  constructor(private readonly cache: CacheService) {}

  /** Invalidate all read-cache entries for a user; optional invoice id for logging symmetry. */
  async invalidateForUser(userId: string, _invoiceId?: string): Promise<void> {
    if (!this.cache.isActive) return;
    const dash = dashboardSummaryKey(userId);
    const list = invoiceListKey(userId);
    await Promise.all([
      this.cache.del(dash),
      this.cache.del(list),
      this.cache.delPattern(invoiceListKeyPattern(userId)),
      this.cache.delPattern(invoiceDetailKeyPattern(userId)),
    ]);
  }

  async getDashboardSummary(
    userId: string,
    loader: () => Promise<DashboardSummaryDto>
  ): Promise<DashboardSummaryDto> {
    const key = dashboardSummaryKey(userId);
    return this.cache.getOrSet(
      key,
      DASHBOARD_SUMMARY_TTL_SEC,
      loader,
      (v) => JSON.stringify(v),
      (raw) => JSON.parse(raw) as DashboardSummaryDto
    );
  }

  async getInvoiceList<T>(userId: string, loader: () => Promise<T>): Promise<T> {
    const key = invoiceListKey(userId);
    return this.cache.getOrSet<T>(
      key,
      INVOICE_LIST_TTL_SEC,
      loader,
      (v) => stringifyInvoicePayload(v),
      (raw) => parseInvoicePayload<T>(raw)
    );
  }

  /**
   * Detail read with true cache-aside: cache hit avoids DB (stable invoices only).
   */
  async getInvoiceDetailCacheAside<T extends { status: InvoiceStatus }>(
    userId: string,
    invoiceId: string,
    loader: () => Promise<T | null>
  ): Promise<T | null> {
    if (!this.cache.isActive) {
      return loader();
    }
    const key = invoiceDetailKey(userId, invoiceId);
    const cached = await this.cache.get(key);
    if (cached !== null) {
      try {
        return parseInvoicePayload<T>(cached);
      } catch {
        await this.cache.del(key);
      }
    }
    const row = await loader();
    if (!row) return null;
    if (row.status === InvoiceStatus.draft) {
      return row;
    }
    try {
      await this.cache.set(key, stringifyInvoicePayload(row), INVOICE_DETAIL_STABLE_TTL_SEC);
    } catch {
      /* logged in CacheService */
    }
    return row;
  }
}
