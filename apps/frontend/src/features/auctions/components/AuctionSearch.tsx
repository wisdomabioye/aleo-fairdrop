import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Input, Button } from '@/components';

export function AuctionSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');

  // Debounce: write to URL 300ms after typing stops
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value.trim()) {
            next.set('q', value.trim());
          } else {
            next.delete('q');
          }
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [value, setSearchParams]);

  // Sync local state if URL param changes externally (e.g. browser back)
  useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    setValue((prev) => (prev !== urlQ ? urlQ : prev));
  }, [searchParams]);

  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search auctions…"
        className="pl-9 pr-8 h-8 text-sm"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 size-6"
          onClick={() => setValue('')}
          aria-label="Clear search"
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}
