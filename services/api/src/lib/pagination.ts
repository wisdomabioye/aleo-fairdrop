import type { Page } from '@fairdrop/types/api';

export interface RawPagination {
  page:     number;
  pageSize: number;
  offset:   number;
}

/** Parse and clamp pagination query params. */
export function parsePagination(params: {
  page?:     number | string;
  pageSize?: number | string;
}): RawPagination {
  const page     = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Wrap query results in the standard Page envelope. */
export function buildPage<T>(
  items:    T[],
  total:    number,
  page:     number,
  pageSize: number,
): Page<T> {
  return {
    items,
    total,
    page,
    pageSize,
    hasNext: page * pageSize < total,
    hasPrev: page > 1,
  };
}
