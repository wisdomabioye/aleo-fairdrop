import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components';
import { cn } from '@/lib/utils';

const PRESETS = [
  { label: '0.5%', bps: 50  },
  { label: '1%',   bps: 100 },
  { label: '2%',   bps: 200 },
];

interface SlippageSettingsProps {
  value:    number;
  onChange: (bps: number) => void;
}

export function SlippageSettings({ value, onChange }: SlippageSettingsProps) {
  const [custom, setCustom] = useState('');

  const handleCustom = (raw: string) => {
    const clean = raw.replace(/[^0-9.]/g, '');
    setCustom(clean);
    const pct = parseFloat(clean);
    if (!Number.isNaN(pct) && pct > 0 && pct <= 50) {
      onChange(Math.round(pct * 100));
    }
  };

  const isPreset = PRESETS.some((p) => p.bps === value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
          <Settings2 className="size-3.5" />
          {(value / 100).toFixed(value % 100 === 0 ? 0 : 1)}%
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-3" align="end">
        <p className="text-xs font-medium">Slippage Tolerance</p>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.bps}
              type="button"
              onClick={() => { onChange(p.bps); setCustom(''); }}
              className={cn(
                'h-8 rounded-lg border text-xs font-medium transition-colors',
                value === p.bps
                  ? 'border-sky-500/16 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                  : 'border-border/70 bg-background/50 text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Custom"
            value={!isPreset && !custom ? (value / 100).toString() : custom}
            onChange={(e) => handleCustom(e.target.value)}
            className="h-8 text-xs"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
