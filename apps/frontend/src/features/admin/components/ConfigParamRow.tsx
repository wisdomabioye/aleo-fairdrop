import { useState }          from 'react';
import { Button, Input, Badge } from '@/components';
import { formatMicrocredits }  from '@fairdrop/sdk/credits';
import { stripSuffix }         from '@fairdrop/sdk/parse';

export interface ConfigParamRowProps {
  label:       string;
  description: string;
  currentRaw:  string | null;
  hardCap:     string;
  unit:        'bps' | 'microcredits' | 'blocks';
  transition:  string;
  inputType:   'u16' | 'u32' | 'u128';
  maxValue:    number | bigint;
  busy:        boolean;
  onSave:      (transition: string, value: string, type: 'u16' | 'u32' | 'u128') => Promise<void>;
  error?:      string;
}

function formatCurrent(raw: string | null, unit: ConfigParamRowProps['unit']): string {
  if (raw == null) return '…';
  const v = stripSuffix(raw);
  if (unit === 'bps')          return `${v} bps (${(parseInt(v) / 100).toFixed(2)}%)`;
  if (unit === 'microcredits') { try { return formatMicrocredits(BigInt(v)); } catch { return v; } }
  return `${v} blocks`;
}

export function ConfigParamRow({
  label, description, currentRaw, hardCap, unit,
  transition, inputType, maxValue, busy, onSave, error,
}: ConfigParamRowProps) {
  const [value, setValue]   = useState('');
  const [localErr, setLocalErr] = useState('');

  async function handleSave() {
    setLocalErr('');
    try {
      const n = inputType === 'u128' ? BigInt(value) : parseInt(value, 10);
      if (typeof n === 'number' && isNaN(n)) { setLocalErr('Enter a valid number.'); return; }
      if (n > maxValue) { setLocalErr(`Exceeds hard cap of ${maxValue}.`); return; }
    } catch {
      setLocalErr('Enter a valid number.');
      return;
    }
    await onSave(transition, value, inputType);
    setValue('');
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 py-3 border-b border-border last:border-0">
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{label}</p>
          <Badge variant="outline" className="text-xs font-mono">
            {formatCurrent(currentRaw, unit)}
          </Badge>
          <span className="text-xs text-muted-foreground shrink-0">hard cap: {hardCap}</span>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
        <Input
          className="w-36 h-8 text-sm"
          placeholder="new value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="number"
          min={0}
        />
        <Button size="sm" disabled={busy || !value} onClick={handleSave}>
          {busy ? '…' : 'Save'}
        </Button>
      </div>

      {(localErr || error) && (
        <p className="text-xs text-destructive col-span-full">{localErr || error}</p>
      )}
    </div>
  );
}
