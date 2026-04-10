import { CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components';
import { cn } from '@/lib/utils';
import type { TokenDisplay } from '@/config/well-known-tokens';

interface TokenChipProps {
  token:    TokenDisplay | null;
  size?:    'sm' | 'md';
  loading?: boolean;
}

const SIZE = {
  sm: { chip: 'gap-1.5 text-xs',   logo: 'size-5 text-[10px]', badge: 'size-3' },
  md: { chip: 'gap-2 text-sm',     logo: 'size-7 text-xs',     badge: 'size-3.5' },
} as const;

export function TokenChip({ token, size = 'sm', loading }: TokenChipProps) {
  const s = SIZE[size];

  if (loading) {
    return (
      <div className={cn('flex items-center', s.chip)}>
        <Skeleton className={cn('shrink-0 rounded-full', s.logo)} />
        <Skeleton className="h-4 w-10 rounded" />
      </div>
    );
  }

  if (!token) {
    return (
      <span className={cn('flex items-center text-muted-foreground', s.chip)}>
        Select token
      </span>
    );
  }

  const monogram = token.symbol.charAt(0).toUpperCase();

  return (
    <span className={cn('inline-flex items-center font-medium', s.chip)}>
      {token.logoUrl ? (
        <img
          src={token.logoUrl}
          alt={token.symbol}
          className={cn('shrink-0 rounded-full object-cover', s.logo)}
        />
      ) : (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full border border-sky-500/14 bg-sky-500/10 font-semibold text-sky-300',
            s.logo,
          )}
        >
          {monogram}
        </span>
      )}
      {token.symbol}
      {token.verified && (
        <CheckCircle2 className={cn('shrink-0 text-sky-400', s.badge)} />
      )}
    </span>
  );
}
