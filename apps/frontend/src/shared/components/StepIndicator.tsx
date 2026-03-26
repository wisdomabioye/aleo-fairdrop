import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  steps: string[];
  /** 0-based current step index */
  currentStep: number;
  done: boolean;
}

export function StepIndicator({ steps, currentStep, done }: StepIndicatorProps) {
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-2 py-1">
        {steps.map((label, i) => {
          const isComplete = done || i < currentStep;
          const isActive = !done && i === currentStep;
          const isUpcoming = !isComplete && !isActive;

          return (
            <li key={label} className="flex items-center gap-2">
              <div
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-full border px-2.5 text-xs font-medium shadow-xs transition-[border-color,background-color,color]',
                  isComplete && 'border-emerald-500/18 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                  isActive && 'border-sky-500/18 bg-sky-500/10 text-sky-700 dark:text-sky-300',
                  isUpcoming && 'border-border bg-background text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-[11px] font-semibold',
                    isComplete && 'bg-emerald-500 text-white',
                    isActive && 'bg-sky-500 text-white',
                    isUpcoming && 'bg-muted text-muted-foreground'
                  )}
                >
                  {isComplete ? <Check className="size-3.5" /> : i + 1}
                </span>

                <span className="max-w-[8rem] truncate">{label}</span>
              </div>

              {i < steps.length - 1 ? (
                <span className="h-px w-4 rounded-full bg-border" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
