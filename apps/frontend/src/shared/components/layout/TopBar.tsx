import { type ReactNode, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Activity } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  AuctionStatusBadge,
  Input,
  Spinner,
  ItemGroup,
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from '@/components';
import { config } from '@/env';
import { useIndexerStatus } from '@/shared/hooks/useIndexerStatus';
import { auctionsService } from '@/services/auctions.service';
import { auctionDetailUrl } from '@/config';
import { AUCTION_REGISTRY } from '@/features/auctions/registry';

// ── IndexerStatus ────────────────────────────────────────────────────────────

type StatusLevel = 'live' | 'delayed' | 'lagging' | 'offline';

function getStatusLevel(lagBlocks: number): StatusLevel {
  if (lagBlocks <= 5)  return 'live';
  if (lagBlocks <= 20) return 'delayed';
  if (lagBlocks <= 50) return 'lagging';
  return 'offline';
}

const STATUS_DOT: Record<StatusLevel, string> = {
  live:    'bg-emerald-500',
  delayed: 'bg-yellow-400',
  lagging: 'bg-orange-500',
  offline: 'bg-rose-500',
};

const STATUS_LABEL: Record<StatusLevel, string> = {
  live:    'Live',
  delayed: 'Delayed',
  lagging: 'Lagging',
  offline: 'Offline',
};

// ── TopBar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  trigger?: ReactNode;
  actions?: ReactNode;
}

export function TopBar({ trigger, actions }: TopBarProps) {
  const { data } = useIndexerStatus();

  return (
    <>
      {!!data?.lagBlocks && <StaleBanner lagBlocks={data.lagBlocks} />}
      <header className="flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md">
        {trigger}

        {/* Network badge */}
        <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {config.network}
        </span>

        <AuctionSearchBar />

        <div className="flex-1" />
        <ChainStatusBadge />

        {actions}
      </header>
    </>
  );
}


// ── StaleBanner ──────────────────────────────────────────────────────────────

function StaleBanner({ lagBlocks }: { lagBlocks: number }) {
  if (lagBlocks <= 50) return null;
  return (
    <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-1.5 text-center text-xs text-yellow-600 dark:text-yellow-400">
      Indexer is {lagBlocks} blocks behind chain tip — data may be stale.
    </div>
  );
}

// ── AuctionSearchBar ─────────────────────────────────────────────────────────

function AuctionSearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['search-auctions-pool'],
    queryFn: () => auctionsService.list({ sort: 'created', order: 'desc', pageSize: 50 }),
    enabled: open,
    staleTime: 60_000,
  });

  const allItems = data?.items ?? [];
  const results =
    debouncedQ.length === 0
      ? allItems.slice(0, 8)
      : allItems
          .filter((a) => {
            const name = (a.name ?? a.id).toLowerCase();
            const q = debouncedQ.toLowerCase();
            return name.includes(q) || a.id.toLowerCase().includes(q);
          })
          .slice(0, 8);

  function handleSelect(id: string) {
    setOpen(false);
    setQuery('');
    navigate(auctionDetailUrl(id));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="group flex h-9 min-w-[220px] items-center gap-2 rounded-xl border border-sky-500/12 bg-background/70 px-3 text-sm text-muted-foreground shadow-xs backdrop-blur-sm transition-[border-color,background-color,box-shadow] hover:border-sky-500/20 hover:bg-background/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sky-400/15"
          aria-label="Search auctions"
        >
          <Search className="size-4 shrink-0 text-sky-500/80 dark:text-sky-400/80" />
          <span className="hidden flex-1 text-left sm:inline">Search auctions...</span>
          <kbd className="hidden rounded-md border border-sky-500/10 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[420px] gap-0 overflow-hidden p-0" align="start" sideOffset={10}>
        <div className="border-b border-sky-500/10 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sky-500/75 dark:text-sky-400/75" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or auction ID..."
              className="border-sky-500/10 bg-sky-950/10 pl-9 shadow-none"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {isFetching ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Spinner className="mr-2" />
              <span className="text-sm">Searching auctions...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {debouncedQ.length < 1 ? 'Type to search auctions...' : 'No auctions found.'}
            </div>
          ) : (
            <ItemGroup className="gap-1">
              {results.map((auction) => {
                const slot = AUCTION_REGISTRY[auction.type];

                return (
                  <Item
                    key={auction.id}
                    asChild
                    variant="default"
                    size="sm"
                    className="rounded-lg border-transparent px-3 py-2.5 hover:bg-sky-500/8"
                  >
                    <button type="button" onClick={() => handleSelect(auction.id)}>
                      <span className={`size-2 shrink-0 rounded-full ${slot?.color ?? 'bg-muted'}`} />
                      <ItemContent className="min-w-0">
                        <ItemTitle className="truncate text-sm">
                          {auction.name ?? `${auction.id.slice(0, 20)}…`}
                        </ItemTitle>
                        <ItemDescription className="truncate text-xs">
                          {slot?.label ?? auction.type}
                        </ItemDescription>
                      </ItemContent>
                      <AuctionStatusBadge status={auction.status} />
                    </button>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ChainStatusBadge() {
  const { data, isError } = useIndexerStatus();

  const lagBlocks = data?.lagBlocks ?? null;
  const chainTip = data?.chainTip ?? null;

  const level: StatusLevel =
    isError || lagBlocks == null ? 'offline' : getStatusLevel(lagBlocks);

  const text =
    level === 'offline'
      ? 'Indexer offline'
      : level === 'live'
        ? 'Indexer live'
        : `Indexer +${lagBlocks}`;

  const title =
    level === 'offline'
      ? 'Indexer offline'
      : `Indexer status: ${STATUS_LABEL[level]}${lagBlocks != null ? ` • ${lagBlocks} blocks behind` : ''}${chainTip != null ? ` • Block ${Number(chainTip).toLocaleString()}` : ''}`;

  return (
    <span
      title={title}
      className="hidden h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-2.5 text-[11px] font-medium sm:inline-flex"
    >
      <Activity className="size-3.5 text-muted-foreground/75" />
      <span className={`size-2 rounded-full ${STATUS_DOT[level]}`} aria-hidden="true" />
      <span className="text-foreground/90">{text}</span>

      {chainTip != null ? (
        <>
          <span className="text-muted-foreground/45">•</span>
          <span className="text-muted-foreground/80">
            Block <span className="text-foreground/90">{Number(chainTip).toLocaleString()}</span>
          </span>
        </>
      ) : null}
    </span>
  );
}
