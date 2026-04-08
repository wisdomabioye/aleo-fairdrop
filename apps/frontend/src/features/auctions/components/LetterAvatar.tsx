import type { CSSProperties } from 'react';
import type { AuctionType } from '@fairdrop/types/domain';
import { cn } from '@/lib/utils';
import { AUCTION_TYPE_COLOR } from '../constants/typeColors';

interface LetterAvatarProps {
  name:        string;
  type?:       AuctionType;
  size?:       'sm' | 'lg';
  className?:  string;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/[\s\-_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0][0] ?? '') + (parts[1][0] ?? '')).toUpperCase();
  }
  return (parts[0] ?? name.trim()).slice(0, 2).toUpperCase();
}

export function LetterAvatar({ name, type, size = 'sm', className }: LetterAvatarProps) {
  const initials = getInitials(name);
  const sizing = size === 'lg'
    ? 'size-16 rounded-xl text-xl font-bold'
    : 'size-10 rounded-lg text-xs font-bold';

  const style: CSSProperties | undefined = type
    ? { backgroundColor: hexToRgba(AUCTION_TYPE_COLOR[type], 0.15), color: AUCTION_TYPE_COLOR[type] }
    : undefined;

  return (
    <div
      className={cn('flex items-center justify-center', className ?? sizing, !type && 'bg-muted text-muted-foreground')}
      style={style}
    >
      {initials}
    </div>
  );
}
