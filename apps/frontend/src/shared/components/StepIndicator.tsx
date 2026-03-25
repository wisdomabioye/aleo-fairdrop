import { CheckCircle2, ChevronRight } from 'lucide-react';

interface StepDotProps {
  n: number;
  label: string;
  current: number;
  done: boolean;
  total: number;
}

function StepDot({ n, label, current, done, total }: StepDotProps) {
  const active = n === current;
  const past   = done || n < current;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <div className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors
          ${past ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          {past && !active ? <CheckCircle2 className="size-4" /> : n}
        </div>
        <span className={`text-xs font-medium hidden sm:block transition-colors
          ${active ? 'text-foreground' : past ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
          {label}
        </span>
      </div>
      {n < total && <ChevronRight className="size-4 text-muted-foreground" />}
    </div>
  );
}

interface StepIndicatorProps {
  steps: string[];
  /** 0-based current step index */
  currentStep: number;
  done: boolean;
}

export function StepIndicator({ steps, currentStep, done }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-1 py-2">
      {steps.map((label, i) => (
        <StepDot
          key={i}
          n={i + 1}
          label={label}
          current={done ? steps.length + 1 : currentStep + 1}
          done={done}
          total={steps.length}
        />
      ))}
    </div>
  );
}
