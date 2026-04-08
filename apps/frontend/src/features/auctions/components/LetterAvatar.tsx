import { cn } from '@/lib/utils';

interface LetterAvatarProps {
  name:       string;
  size?:      'sm' | 'lg';
  className?: string;
}

const PALETTE = [
  { bg: 'bg-sky-500/15',     text: 'text-sky-300'     },
  { bg: 'bg-indigo-500/15',  text: 'text-indigo-300'  },
  { bg: 'bg-violet-500/15',  text: 'text-violet-300'  },
  { bg: 'bg-rose-500/15',    text: 'text-rose-300'    },
  { bg: 'bg-orange-500/15',  text: 'text-orange-300'  },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  { bg: 'bg-amber-500/15',   text: 'text-amber-300'   },
  { bg: 'bg-pink-500/15',    text: 'text-pink-300'    },
  { bg: 'bg-teal-500/15',    text: 'text-teal-300'    },
  { bg: 'bg-cyan-500/15',    text: 'text-cyan-300'    },
] as const;

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/[\s\-_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0][0] ?? '') + (parts[1][0] ?? '')).toUpperCase();
  }
  return (parts[0] ?? name.trim()).slice(0, 2).toUpperCase();
}

export function LetterAvatar({ name, size = 'sm', className }: LetterAvatarProps) {
  const initials = getInitials(name);
  const { bg, text } = PALETTE[hashName(name) % PALETTE.length];
  const sizing = size === 'lg'
    ? 'size-16 rounded-xl text-xl font-bold'
    : 'size-10 rounded-lg text-xs font-bold';

  return (
    <div className={cn('flex items-center justify-center', className ?? sizing, bg, text)}>
      {initials}
    </div>
  );
}
