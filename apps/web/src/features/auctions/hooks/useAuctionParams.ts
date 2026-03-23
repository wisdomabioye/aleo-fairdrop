import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AuctionListParams } from '@fairdrop/types/api';
import { AuctionType, AuctionStatus } from '@fairdrop/types/domain';

const AUCTION_TYPES   = Object.values(AuctionType);
const AUCTION_STATUSES = Object.values(AuctionStatus);
const SORT_VALUES     = ['created', 'endBlock', 'progressPct', 'volume'] as const;

function parseEnum<T extends string>(val: string | null, valid: T[]): T | undefined {
  return val && (valid as string[]).includes(val) ? (val as T) : undefined;
}

function parseNumber(val: string | null): number | undefined {
  const n = val ? Number(val) : NaN;
  return isNaN(n) ? undefined : n;
}

export function useAuctionParams(): [AuctionListParams, (next: Partial<AuctionListParams>) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const params: AuctionListParams = {
    type:     parseEnum(searchParams.get('type'), AUCTION_TYPES),
    status:   parseEnum(searchParams.get('status'), AUCTION_STATUSES),
    creator:  searchParams.get('creator') ?? undefined,
    token:    searchParams.get('token') ?? undefined,
    page:     parseNumber(searchParams.get('page')),
    pageSize: parseNumber(searchParams.get('pageSize')),
    sort:     parseEnum(searchParams.get('sort'), SORT_VALUES as unknown as string[]) as AuctionListParams['sort'],
    order:    (searchParams.get('order') as 'asc' | 'desc') ?? undefined,
  };

  const setParams = useCallback(
    (next: Partial<AuctionListParams>) => {
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          (Object.entries(next) as [string, unknown][]).forEach(([k, v]) => {
            if (v == null) updated.delete(k);
            else updated.set(k, String(v));
          });
          // Reset to page 1 whenever a filter changes
          const isFilterChange = Object.keys(next).some((k) => k !== 'page' && k !== 'pageSize');
          if (isFilterChange) updated.delete('page');
          return updated;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [params, setParams];
}
