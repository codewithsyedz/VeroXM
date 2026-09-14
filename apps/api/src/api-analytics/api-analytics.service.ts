import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type AnalyticsRange = '1h' | '24h' | '7d' | '30d';

export interface AnalyticsSummary {
  range: AnalyticsRange;
  since: string;
  totalRequests: number;
  successRate: number;
  avgResponseMs: number;
  failedRequests: number;
}

export interface DailyVolumePoint {
  date: string;
  count: number;
}

export interface EndpointBreakdownEntry {
  method: string;
  endpoint: string;
  count: number;
  avgResponseMs: number;
  errorCount: number;
}

export interface IpBreakdownEntry {
  ip: string;
  count: number;
  lastSeen: string;
}

export interface RequestLogEntry {
  id: number;
  apiVersion: string;
  method: string;
  path: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
  ip: string | null;
  createdAt: string;
}

export interface RequestLogPage {
  items: RequestLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

const RANGE_MS: Record<AnalyticsRange, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

function parseRange(raw: string | undefined): AnalyticsRange {
  return raw === '1h' || raw === '24h' || raw === '7d' || raw === '30d' ? raw : '7d';
}

@Injectable()
export class ApiAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadProjectOrThrow(projectId: number) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return project;
  }

  private since(range: AnalyticsRange): Date {
    return new Date(Date.now() - RANGE_MS[range]);
  }

  async summary(projectId: number, rangeInput?: string): Promise<AnalyticsSummary> {
    await this.loadProjectOrThrow(projectId);
    const range = parseRange(rangeInput);
    const since = this.since(range);

    const [total, failed, avg] = await Promise.all([
      this.prisma.apiRequestLog.count({ where: { projectId, createdAt: { gte: since } } }),
      this.prisma.apiRequestLog.count({
        where: { projectId, createdAt: { gte: since }, statusCode: { gte: 400 } },
      }),
      this.prisma.apiRequestLog.aggregate({
        where: { projectId, createdAt: { gte: since } },
        _avg: { durationMs: true },
      }),
    ]);

    return {
      range,
      since: since.toISOString(),
      totalRequests: total,
      successRate: total > 0 ? Math.round(((total - failed) / total) * 1000) / 10 : 100,
      avgResponseMs: avg._avg.durationMs ? Math.round(avg._avg.durationMs) : 0,
      failedRequests: failed,
    };
  }

  // Grouped by calendar day via a raw query — Prisma's groupBy has no
  // DATE(created_at) truncation, and this table can genuinely grow large
  // enough that pulling every row and bucketing in JS isn't the right call.
  async timeseries(projectId: number, rangeInput?: string): Promise<DailyVolumePoint[]> {
    await this.loadProjectOrThrow(projectId);
    const range = parseRange(rangeInput);
    const since = this.since(range);

    const rows = await this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM api_request_logs
      WHERE project_id = ${projectId} AND created_at >= ${since}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    return rows.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
      count: Number(r.count),
    }));
  }

  async endpoints(projectId: number, rangeInput?: string): Promise<EndpointBreakdownEntry[]> {
    await this.loadProjectOrThrow(projectId);
    const range = parseRange(rangeInput);
    const since = this.since(range);

    const [totals, errors] = await Promise.all([
      this.prisma.apiRequestLog.groupBy({
        by: ['method', 'endpoint'],
        where: { projectId, createdAt: { gte: since } },
        _count: { _all: true },
        _avg: { durationMs: true },
      }),
      this.prisma.apiRequestLog.groupBy({
        by: ['method', 'endpoint'],
        where: { projectId, createdAt: { gte: since }, statusCode: { gte: 400 } },
        _count: { _all: true },
      }),
    ]);

    const errorByKey = new Map<string, number>();
    for (const e of errors) {
      errorByKey.set(`${e.method} ${e.endpoint}`, e._count._all);
    }

    return totals
      .map((t) => ({
        method: t.method,
        endpoint: t.endpoint,
        count: t._count._all,
        avgResponseMs: t._avg.durationMs ? Math.round(t._avg.durationMs) : 0,
        errorCount: errorByKey.get(`${t.method} ${t.endpoint}`) ?? 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
  }

  async ips(projectId: number, rangeInput?: string): Promise<IpBreakdownEntry[]> {
    await this.loadProjectOrThrow(projectId);
    const range = parseRange(rangeInput);
    const since = this.since(range);

    const rows = await this.prisma.apiRequestLog.groupBy({
      by: ['ip'],
      where: { projectId, createdAt: { gte: since }, ip: { not: null } },
      _count: { _all: true },
      _max: { createdAt: true },
    });

    return rows
      .map((r) => ({
        ip: r.ip ?? 'unknown',
        count: r._count._all,
        lastSeen: (r._max.createdAt ?? new Date()).toISOString(),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
  }

  async logs(
    projectId: number,
    options: { limit?: number; offset?: number; method?: string; status?: string },
  ): Promise<RequestLogPage> {
    await this.loadProjectOrThrow(projectId);

    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    const where: Record<string, unknown> = { projectId };
    if (options.method) where.method = options.method.toUpperCase();
    if (options.status === 'success') where.statusCode = { lt: 400 };
    if (options.status === 'error') where.statusCode = { gte: 400 };

    const [rows, total] = await Promise.all([
      this.prisma.apiRequestLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.apiRequestLog.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        apiVersion: r.apiVersion,
        method: r.method,
        path: r.path,
        endpoint: r.endpoint,
        statusCode: r.statusCode,
        durationMs: r.durationMs,
        ip: r.ip,
        createdAt: (r.createdAt ?? new Date()).toISOString(),
      })),
      total,
      limit,
      offset,
    };
  }
}
