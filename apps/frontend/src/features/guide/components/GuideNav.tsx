import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { GUIDE_NAV } from '../config/nav';
import type { NavItem } from '../config/nav';

const BASE = '/guide';

function isActive(path: string, location: string): boolean {
  const full = path === '' ? BASE : `${BASE}/${path}`;
  return location === full || location.startsWith(full + '/');
}

function NavLeaf({ item }: { item: NavItem }) {
  const location = useLocation().pathname;
  const to = item.path === '' ? BASE : `${BASE}/${item.path}`;
  const active = isActive(item.path, location);

  return (
    <NavLink
      to={to}
      end
      className={cn(
        'block truncate rounded-md px-2 py-1 text-sm transition-colors',
        active
          ? 'bg-sky-500/10 font-medium text-sky-600 dark:text-sky-300'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {item.label}
    </NavLink>
  );
}

function NavGroup({ item }: { item: NavItem }) {
  const location = useLocation().pathname;
  const groupActive = isActive(item.path, location);
  const [open, setOpen] = useState(groupActive);

  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  if (!item.children) return <NavLeaf item={item} />;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between rounded-md px-2 py-1 text-sm font-medium transition-colors',
          groupActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {item.label}
        <ChevronDown
          className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-0.5 ml-2 space-y-0.5 border-l border-border/60 pl-2">
          {item.children.map((child) => (
            <NavLeaf key={child.path} item={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export function GuideNav() {
  return (
    <nav className="space-y-0.5">
      {GUIDE_NAV.map((item) =>
        item.children ? (
          <NavGroup key={item.path} item={item} />
        ) : (
          <NavLeaf key={item.path} item={item} />
        )
      )}
    </nav>
  );
}
