import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Skeleton, PageHeader } from '@fairdrop/ui';
import type { GateMode } from '@fairdrop/types/domain';
import { useAuctions } from '../hooks/useAuctions';
import { useAuctionParams } from '../hooks/useAuctionParams';
import { AuctionCard } from '../components/AuctionCard';
import { AuctionFilters } from '../components/AuctionFilters';
import { AuctionSearch } from '../components/AuctionSearch';

const PAGE_SIZE = 12;

export function AuctionListPage() {
  const [params, setParams] = useAuctionParams();
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q')?.toLowerCase() ?? '';

  // Client-side gate/vested filters (not in API params)
  const [gateFilter, setGateFilter] = useState<GateMode | 'all'>('all');
  const [vestedOnly, setVestedOnly]  = useState(false);

  const page     = params.page ?? 1;
  const pageSize = params.pageSize ?? PAGE_SIZE;

  const { data, isLoading, isError } = useAuctions({ ...params, pageSize });

  // Client-side search + gate/vested filtering on top of server results
  const items = (data?.items ?? []).filter((a) => {
    if (q) {
      const name = (a.name ?? a.id).toLowerCase();
      if (!name.includes(q) && !a.id.toLowerCase().includes(q)) return false;
    }
    if (gateFilter !== 'all' && a.gateMode !== gateFilter) return false;
    if (vestedOnly && !a.vestEnabled) return false;
    return true;
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Auctions"
        description="Browse and bid on token distribution auctions."
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-start gap-3">
        <AuctionSearch />
        <AuctionFilters
          params={params}
          onChange={setParams}
          gate={gateFilter}
          onGateChange={setGateFilter}
          vestedOnly={vestedOnly}
          onVestedChange={setVestedOnly}
        />
      </div>

      {/* Results */}
      {isError && (
        <p className="text-sm text-destructive">Failed to load auctions. Please try again.</p>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No auctions match your filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setParams({ page: page - 1 })}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setParams({ page: page + 1 })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
