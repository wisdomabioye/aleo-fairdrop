import { Input, Label } from '@/components';
import type { SigEntry, ThreeSigs } from '../../types';

interface SignaturePanelProps {
  value:    ThreeSigs;
  onChange: (v: ThreeSigs) => void;
}

export function SignaturePanel({ value, onChange }: SignaturePanelProps) {
  function update(i: 0 | 1 | 2, field: keyof SigEntry, text: string) {
    const next = value.map((e, idx) => idx === i ? { ...e, [field]: text } : e) as ThreeSigs;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
        3-of-5 Signatures
      </p>
      {([0, 1, 2] as const).map((i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Admin {i + 1} address</Label>
            <Input
              className="h-7 font-mono text-[11px]"
              placeholder="aleo1…"
              value={value[i].admin}
              onChange={(e) => update(i, 'admin', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Signature {i + 1}</Label>
            <Input
              className="h-7 font-mono text-[11px]"
              placeholder="sign1…"
              value={value[i].sig}
              onChange={(e) => update(i, 'sig', e.target.value)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** All 3 sig + admin fields are filled in. */
export function sigsComplete(sigs: ThreeSigs): boolean {
  return sigs.every((e) => e.sig.startsWith('sign1') && e.admin.startsWith('aleo1'));
}
