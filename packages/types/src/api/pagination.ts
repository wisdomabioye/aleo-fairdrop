/** Offset-based page wrapper. */
export interface Page<T> {
  items:    T[];
  total:    number;
  page:     number;
  pageSize: number;
  hasNext:  boolean;
  hasPrev:  boolean;
}

/** Cursor-based page wrapper — preferred for real-time feeds. */
export interface CursorPage<T> {
  items:      T[];
  nextCursor: string | null;
  prevCursor: string | null;
}

export type SortOrder = 'asc' | 'desc';

export interface PaginationParams {
  page?:     number;
  pageSize?: number;
  cursor?:   string;
  sort?:     SortOrder;
}
