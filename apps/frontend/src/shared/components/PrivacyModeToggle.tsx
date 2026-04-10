import { Eye, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PrivacyModeToggleProps {
  mode:     'private' | 'public';
  onChange: (mode: 'private' | 'public') => void;
}

export function PrivacyModeToggle({ mode, onChange }: PrivacyModeToggleProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(['private', 'public'] as const).map((value) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              'flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors',
              active
                ? 'border-sky-500/16 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                : 'border-border/70 bg-background/50 text-muted-foreground hover:border-sky-500/10 hover:text-foreground',
            )}
          >
            {value === 'private' ? <Shield className="size-3.5" /> : <Eye className="size-3.5" />}
            {value === 'private' ? 'Private' : 'Public'}
          </button>
        );
      })}
    </div>
  );
}
