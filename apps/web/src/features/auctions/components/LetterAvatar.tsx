interface LetterAvatarProps {
  name:      string;
  size?:     'sm' | 'lg';
  className?: string;
}

export function LetterAvatar({ name, size = 'sm', className }: LetterAvatarProps) {
  const letter = name.trim()[0]?.toUpperCase() ?? '?';
  const base =
    size === 'lg'
      ? 'flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl font-bold text-muted-foreground'
      : 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground';
  return <div className={className ?? base}>{letter}</div>;
}
