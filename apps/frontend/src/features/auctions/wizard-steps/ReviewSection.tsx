/**
 * Reusable collapsible section for the auction review step.
 * Starts expanded; user can collapse any section.
 */
import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components';
import { cn } from '@/lib/utils';

export type SectionStatus = 'ok' | 'warning' | 'error' | undefined;

interface ReviewSectionProps {
  title:    string;
  status?:  SectionStatus;
  children: React.ReactNode;
}

export function ReviewSection({ title, status, children }: ReviewSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-left transition-colors hover:bg-background/80">
        <span className="text-xs font-semibold uppercase tracking-wide">
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          {status === 'error'   && <AlertCircle   className="size-3 text-destructive" />}
          {status === 'warning' && <AlertTriangle className="size-3 text-amber-500" />}
          {status === 'ok'      && <CheckCircle2  className="size-3 text-emerald-500" />}
          <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-1 divide-y divide-border/60 rounded-lg border border-border/70 bg-background/40">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ReviewRowProps {
  label:   string;
  value:   React.ReactNode;
  mono?:   boolean;
  status?: 'warning' | 'error';
}

export function ReviewRow({ label, value, mono = true, status }: ReviewRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        'text-right text-xs break-all',
        mono && 'font-mono',
        status === 'error'   && 'text-destructive',
        status === 'warning' && 'text-amber-500',
      )}>
        {value}
      </span>
    </div>
  );
}
