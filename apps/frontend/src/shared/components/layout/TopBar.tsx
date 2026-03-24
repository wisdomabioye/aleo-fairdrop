import { type ReactNode, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  AuctionStatusBadge,
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

function IndexerStatusBadge() {
  const { data, isError } = useIndexerStatus();
  const level: StatusLevel =
    isError || !data ? 'offline' : getStatusLevel(data.lagBlocks);

  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
      <span className={`size-2 rounded-full ${STATUS_DOT[level]}`} aria-hidden="true" />
      {STATUS_LABEL[level]}
    </span>
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
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const navigate            = useNavigate();
  const debounceRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQ, setDebouncedQ] = useState('');

  // Debounce the search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fetch a pool of recent auctions; client-side filter by name/id
  const { data, isFetching } = useQuery({
    queryKey:  ['search-auctions-pool'],
    queryFn:   () => auctionsService.list({ sort: 'created', order: 'desc', pageSize: 50 }),
    enabled:   open,
    staleTime: 60_000,
  });

  const allItems = data?.items ?? [];
  const results = debouncedQ.length === 0
    ? allItems.slice(0, 8)
    : allItems
        .filter((a) => {
          const name = (a.name ?? a.id).toLowerCase();
          const q    = debouncedQ.toLowerCase();
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
          className="flex h-8 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Search auctions"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="hidden sm:inline">Search auctions…</span>
          <kbd className="hidden rounded border border-border bg-background px-1 text-[10px] font-mono leading-none sm:inline">
            ⌘K
          </kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[380px] p-0"
        align="start"
        sideOffset={8}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or ID…"
            value={query}
            onValueChange={setQuery}
            className="border-none focus:ring-0"
          />
          <CommandList className="max-h-72">
            {!isFetching && results.length === 0 && (
              <CommandEmpty>
                {debouncedQ.length < 1 ? 'Type to search auctions…' : 'No auctions found.'}
              </CommandEmpty>
            )}
            {results.map((auction) => {
              const slot = AUCTION_REGISTRY[auction.type];
              return (
                <CommandItem
                  key={auction.id}
                  value={auction.id}
                  onSelect={() => handleSelect(auction.id)}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                >
                  {/* Type color swatch */}
                  <span className={`size-2 rounded-full shrink-0 ${slot?.color ?? 'bg-muted'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">
                      {auction.name ?? `${auction.id.slice(0, 20)}…`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {slot?.label ?? auction.type}
                    </p>
                  </div>
                  <AuctionStatusBadge status={auction.status} />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── TopBar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  trigger?: ReactNode;
  actions?: ReactNode;
}

export function TopBar({ trigger, actions }: TopBarProps) {
  const { data } = useIndexerStatus();

  return (
    <>
      {data && <StaleBanner lagBlocks={data.lagBlocks} />}
      <header className="flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md">
        {trigger}

        {/* Network badge */}
        <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {config.network}
        </span>

        <AuctionSearchBar />

        <div className="flex-1" />

        <IndexerStatusBadge />

        {actions}
      </header>
    </>
  );
}
