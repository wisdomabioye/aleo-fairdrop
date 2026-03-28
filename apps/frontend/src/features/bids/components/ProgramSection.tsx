import { useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, Spinner } from '@/components';
import { AuctionType } from '@fairdrop/types/domain';
import { useBidRecords } from '@/shared/hooks/useBidRecords';
import { useCommitmentRecords } from '@/shared/hooks/useCommitmentRecords';
import { AUCTION_REGISTRY } from '@/features/auctions/registry';
import { BidRow } from './BidRow';
import { CommitmentRow } from './CommitmentRow';

export interface ProgramMeta {
  programId: string;
  type:      AuctionType;
}

interface ProgramSectionProps {
  meta: ProgramMeta;
}

export function ProgramSection({ meta }: ProgramSectionProps) {
  const slot     = AUCTION_REGISTRY[meta.type];
  const isSealed = meta.type === AuctionType.Sealed;

  const [open,    setOpen]    = useState(false);
  const [fetched, setFetched] = useState(false);

  const { bidRecords, loading: loadingBids, fetchRecords: fetchBids } =
    useBidRecords(meta.programId, { fetchOnMount: false });

  const { commitmentRecords, loading: loadingCommitments, fetchRecords: fetchCommitments } =
    useCommitmentRecords(meta.programId, { fetchOnMount: false });

  const loading    = loadingBids || (isSealed && loadingCommitments);
  const totalBids  = bidRecords.length;
  const totalCmts  = isSealed ? commitmentRecords.length : 0;
  const totalCount = totalBids + totalCmts;

  function doFetch() {
    void fetchBids();
    if (isSealed) void fetchCommitments();
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !fetched) {
      setFetched(true);
      doFetch();
    }
  }

  function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation();
    doFetch();
  }

  return (
    <Card className="overflow-hidden border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader
        className="cursor-pointer select-none px-4 py-2 hover:bg-white/5 transition-colors"
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {open
              ? <ChevronDown  className="size-3.5 shrink-0 text-muted-foreground" />
              : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            }
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${slot.color}`}>
              {slot.label}
            </span>
            <span className="hidden truncate font-mono text-xs text-muted-foreground sm:block">
              {meta.programId}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {loading && <Spinner className="size-3" />}
            {fetched && !loading && (
              <span className="text-xs text-muted-foreground">
                {totalCount} record{totalCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3 px-4 pb-4 pt-0">
          <div className="h-px bg-border/50" />

          {/* Program ID — shown on mobile since header truncates it */}
          <p className="font-mono text-[10px] text-muted-foreground sm:hidden">{meta.programId}</p>

          {loading && (
            <div className="flex justify-center py-6">
              <Spinner className="size-5" />
            </div>
          )}

          {!loading && fetched && totalCount === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No records found in this program.
            </p>
          )}

          {!loading && fetched && totalBids > 0 && (
            <div className="space-y-2">
              {bidRecords.map((bid) => (
                <BidRow key={bid.id} bid={bid} />
              ))}
            </div>
          )}

          {!loading && fetched && totalCmts > 0 && (
            <div className="space-y-2">
              {totalBids > 0 && (
                <p className="pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Sealed Commitments
                </p>
              )}
              {commitmentRecords.map((c) => (
                <CommitmentRow key={c.id} commitment={c} />
              ))}
            </div>
          )}

          {fetched && !loading && (
            <div className="flex justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleRefresh}
              >
                <RefreshCw className="size-3" />
                Refresh
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
