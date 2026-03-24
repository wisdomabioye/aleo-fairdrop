/**
 * My Bids — fetches private Bid records directly from the wallet.
 *
 * Bid records are encrypted to the owner's key and never indexed by the API.
 * Each of the 6 auction programs is shown as an expandable section; clicking
 * "Fetch" calls requestRecords(programId) for that program only.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Spinner,
} from '@/components';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { AuctionType } from '@fairdrop/types/domain';
import { recField, recU128, hasRecordKey } from '@fairdrop/sdk/parse';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { AUCTION_REGISTRY } from '@/features/auctions/registry';
import { auctionDetailUrl, AppRoutes } from '@/config';
import { config } from '@/env';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BidRecord {
  auctionId:     string;
  quantity:      bigint;
  paymentAmount: bigint;
}

type FetchState = 'idle' | 'loading' | 'done' | 'error';

interface ProgramMeta {
  programId: string;
  type:      AuctionType;
}

// ── Program list ──────────────────────────────────────────────────────────────

const PROGRAMS: ProgramMeta[] = [
  { programId: config.programs.dutch.programId,     type: AuctionType.Dutch },
  { programId: config.programs.sealed.programId,    type: AuctionType.Sealed },
  { programId: config.programs.raise.programId,     type: AuctionType.Raise },
  { programId: config.programs.ascending.programId, type: AuctionType.Ascending },
  { programId: config.programs.lbp.programId,       type: AuctionType.Lbp },
  { programId: config.programs.quadratic.programId, type: AuctionType.Quadratic },
];

// ── ProgramSection ────────────────────────────────────────────────────────────

function ProgramSection({
  meta,
  requestRecords,
}: {
  meta:           ProgramMeta;
  requestRecords: (programId: string) => Promise<Record<string, unknown>[]>;
}) {
  const slot = AUCTION_REGISTRY[meta.type];
  const [open,   setOpen]   = useState(false);
  const [state,  setState]  = useState<FetchState>('idle');
  const [bids,   setBids]   = useState<BidRecord[]>([]);

  async function fetchBids() {
    setState('loading');
    try {
      const recs = await requestRecords(meta.programId).catch(() => []);
      const parsed: BidRecord[] = [];
      for (const rec of recs ?? []) {
        const auctionId = recField(rec, 'auction_id');
        if (!auctionId) continue;
        // Skip CommitmentRecords (sealed-bid pre-reveal records)
        if (hasRecordKey(rec, 'commitment_hash')) continue;
        parsed.push({
          auctionId,
          quantity:      recU128(rec, 'quantity'),
          paymentAmount: recU128(rec, 'payment_amount'),
        });
      }
      setBids(parsed);
      setState('done');
    } catch {
      setState('error');
    }
  }

  function handleToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && state === 'idle') fetchBids();
  }

  return (
    <Card>
      {/* Header — clickable to expand */}
      <CardHeader
        className="cursor-pointer select-none"
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {open
              ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            }
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${slot.color}`}>
              {slot.label}
            </span>
            <CardTitle className="text-sm font-medium">{meta.programId}</CardTitle>
          </div>
          {state === 'done' && (
            <span className="text-xs text-muted-foreground">
              {bids.length} record{bids.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3 pt-0">
          {state === 'loading' && (
            <div className="flex justify-center py-4">
              <Spinner className="size-5" />
            </div>
          )}

          {state === 'error' && (
            <p className="text-xs text-destructive text-center py-2">
              Failed to fetch records.{' '}
              <button
                className="underline hover:no-underline"
                onClick={(e) => { e.stopPropagation(); setState('idle'); fetchBids(); }}
              >
                Retry
              </button>
            </p>
          )}

          {state === 'done' && bids.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">
              No bid records found in this program.
            </p>
          )}

          {state === 'done' && bids.length > 0 && (
            <div className="space-y-2">
              {bids.map((bid, i) => (
                <div
                  key={`${bid.auctionId}-${i}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-mono text-xs text-muted-foreground truncate">
                      {bid.auctionId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Qty: <span className="text-foreground">{bid.quantity.toLocaleString()}</span>
                      {' · '}
                      Locked: <span className="text-foreground">
                        {formatMicrocredits(bid.paymentAmount)} ALEO
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={auctionDetailUrl(bid.auctionId)}>
                        View <ArrowRight className="ml-1 size-3" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link to={AppRoutes.claim}>Claim</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {state === 'done' && (
            <div className="flex justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={(e) => { e.stopPropagation(); setState('idle'); fetchBids(); }}
              >
                Refresh
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── MyBidsPage ────────────────────────────────────────────────────────────────

export function MyBidsPage() {
  const { connected, requestRecords } = useWallet();

  if (!connected) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <PageHeader
          title="My Bids"
          description="Bid records are zero-knowledge proofs encrypted to your address — only your wallet can decrypt them."
        />
        <ConnectWalletPrompt message="Connect your wallet to see your bid records." />
      </div>
    );
  }

  const fetch = requestRecords as (p: string) => Promise<Record<string, unknown>[]>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <PageHeader
        title="My Bids"
        description="Expand an auction type to fetch and view your private bid records."
      />

      <p className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
        Records are fetched directly from your wallet
      </p>

      <div className="space-y-2">
        {PROGRAMS.map((meta) => (
          <ProgramSection
            key={meta.programId}
            meta={meta}
            requestRecords={fetch}
          />
        ))}
      </div>
    </div>
  );
}
