import { Request } from "express";

const DEFAULT_LIMIT = 25;
// NOTE(changed): was 100. The HOD/CXO "All Department Tickets" search (see
// ManagerDashboard/CxoDashboard + AdvancedTicketFilters) pulls a whole
// department's ticket set in one request so it can be filtered client-side,
// so the cap needs enough headroom for a busy department.
const MAX_LIMIT = 500;

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

/** GET /tickets?page=2&limit=50 -> { skip: 50, take: 50, page: 2, limit: 50 } */
export function parsePagination(req: Request): Pagination {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function paginatedResponse<T>(items: T[], total: number, { page, limit }: Pagination) {
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
