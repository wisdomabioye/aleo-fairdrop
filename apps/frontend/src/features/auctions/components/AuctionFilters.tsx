import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Label,
  Switch,
} from '@/components';
import { AuctionType, AuctionStatus, GateMode } from '@fairdrop/types/domain';
import type { AuctionListParams } from '@fairdrop/types/api';

interface AuctionFiltersProps {
  params: AuctionListParams;
  onChange: (next: Partial<AuctionListParams>) => void;
  /** Gate and vested filters are UI-only (client-side); not part of AuctionListParams. */
  gate?: GateMode | 'all';
  onGateChange?: (gate: GateMode | 'all') => void;
  vestedOnly?: boolean;
  onVestedChange?: (vestedOnly: boolean) => void;
}

const TYPE_OPTIONS: { label: string; value: AuctionType | 'all' }[] = [
  { label: 'All types',  value: 'all' },
  { label: 'Dutch',      value: AuctionType.Dutch },
  { label: 'Sealed',     value: AuctionType.Sealed },
  { label: 'Raise',      value: AuctionType.Raise },
  { label: 'Ascending',  value: AuctionType.Ascending },
  { label: 'LBP',        value: AuctionType.Lbp },
  { label: 'Quadratic',  value: AuctionType.Quadratic },
];

const STATUS_OPTIONS: { label: string; value: AuctionStatus | 'all' }[] = [
  { label: 'All statuses', value: 'all' },
  { label: 'Upcoming',     value: AuctionStatus.Upcoming },
  { label: 'Active',       value: AuctionStatus.Active },
  { label: 'Clearing',     value: AuctionStatus.Clearing },
  { label: 'Cleared',      value: AuctionStatus.Cleared },
  { label: 'Ended',        value: AuctionStatus.Ended },
  { label: 'Voided',       value: AuctionStatus.Voided },
];

const GATE_OPTIONS: { label: string; value: GateMode | 'all' }[] = [
  { label: 'All gates',   value: 'all' },
  { label: 'Open',        value: GateMode.Open },
  { label: 'Merkle',      value: GateMode.Merkle },
  { label: 'Credential',  value: GateMode.Credential },
];

const SORT_OPTIONS: { label: string; value: NonNullable<AuctionListParams['sort']> | 'default' }[] = [
  { label: 'Default',      value: 'default' },
  { label: 'Newest',       value: 'created' },
  { label: 'Ending soon',  value: 'endBlock' },
  { label: 'Most filled',  value: 'progressPct' },
  { label: 'Volume',       value: 'volume' },
];

export function AuctionFilters({
  params,
  onChange,
  gate = 'all',
  onGateChange,
  vestedOnly = false,
  onVestedChange,
}: AuctionFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Type */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Type</Label>
        <Select
          value={params.type ?? 'all'}
          onValueChange={(v) =>
            onChange({ type: v === 'all' ? undefined : (v as AuctionType) })
          }
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select
          value={params.status ?? 'all'}
          onValueChange={(v) =>
            onChange({ status: v === 'all' ? undefined : (v as AuctionStatus) })
          }
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Gate */}
      {onGateChange && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Gate</Label>
          <Select
            value={gate}
            onValueChange={(v) => onGateChange(v as GateMode | 'all')}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Sort */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Sort</Label>
        <Select
          value={params.sort ?? 'default'}
          onValueChange={(v) =>
            onChange({ sort: v === 'default' ? undefined : (v as AuctionListParams['sort']) })
          }
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Vested only */}
      {onVestedChange && (
        <div className="flex items-center gap-2 self-end pb-1">
          <Switch
            id="vested-only"
            checked={vestedOnly}
            onCheckedChange={onVestedChange}
            className="h-4 w-7"
          />
          <Label htmlFor="vested-only" className="text-xs cursor-pointer whitespace-nowrap">
            Vested only
          </Label>
        </div>
      )}
    </div>
  );
}
