import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { Card, CardContent, Skeleton } from '@/components';
import { truncateAddress } from '@fairdrop/sdk/format';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AppRoutes } from '@/config';
import { useCreatorReputation } from '@/features/auctions/hooks/useCreatorReputation';
import { useAuctions } from '@/features/auctions/hooks/useAuctions';
import { CreatorBadge } from '@/features/auctions/components/CreatorBadge';
import { AuctionCard } from '@/features/auctions/components/AuctionCard';

export function CreatorPage() {
  const { address } = useParams<{ address: string }>();

  if (!address) {
    return (
      <div className="p-4">
        <p className="text-sm text-destructive">Invalid creator address.</p>
        <Link to={AppRoutes.creators} className="text-sm text-muted-foreground underline underline-offset-4">
          Back to creators
        </Link>
      </div>
    );
  }

  return <CreatorContent address={address} />;
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2.5 text-center">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/75">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function CreatorContent({ address }: { address: string }) {
  const { data: rep, isLoading: repLoading, isError: repError, error: repErrorObj } = useCreatorReputation(address);
  const { data: auctionsPage, isLoading: auctionsLoading } = useAuctions({ creator: address, pageSize: 50 });
  const auctions = auctionsPage?.items ?? [];

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to={AppRoutes.creators} className="hover:text-foreground">Creators</Link>
        <span>/</span>
        <span className="truncate text-foreground">{truncateAddress(address)}</span>
      </div>

      <Card className="max-w-lg border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
        <CardContent className="space-y-2.5 p-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={copyAddress}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="font-medium text-foreground">{truncateAddress(address)}</span>
              {copied
                ? <Check className="size-3 text-emerald-500" />
                : <Copy className="size-3" />}
            </button>
            {rep && rep.tier !== 'none' && (
              <CreatorBadge tier={rep.tier} stats={rep} size="md" />
            )}
          </div>

          {repLoading ? (
            <Skeleton className="h-20 w-full rounded-lg" />
          ) : repError ? (
            (repErrorObj as Error)?.message?.includes('404') ||
            (repErrorObj as Error)?.message?.includes('No reputation') ? (
              <p className="text-sm text-muted-foreground">
                No on-chain reputation yet — no closed auctions recorded.
              </p>
            ) : (
              <p className="text-sm text-destructive">
                Failed to load reputation data.
              </p>
            )
          ) : rep ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label="Auctions" value={rep.auctionsRun} />
                <StatCard label="Filled" value={rep.filledAuctions} />
                <StatCard label="Fill rate" value={`${(rep.fillRate * 100).toFixed(0)}%`} />
                <StatCard
                  label="Total raised"
                  value={formatMicrocredits(BigInt(rep.volumeMicrocredits))}
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Auctions by this creator</h2>
        {auctionsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : auctions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No auctions found.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {auctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
