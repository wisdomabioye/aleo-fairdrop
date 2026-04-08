import { useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { GuideNav }     from '../components/GuideNav';
import { MarkdownPage } from '../components/MarkdownPage';
import { GUIDE_ROUTES } from '../config/routes';

const BASE = '/guide';

function useGuideContent(): string {
  const { pathname } = useLocation();
  const key = pathname === BASE ? '' : pathname.slice(BASE.length + 1);
  return GUIDE_ROUTES[key] ?? `# Not found\n\nNo guide page found for \`${pathname}\`.`;
}

export function GuidePage() {
  const content = useGuideContent();
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    // SidebarInset renders a <main> itself, so there are two nested <main>s.
    // The inner one (direct child of sidebar-inset) is the actual scroll container.
    document.querySelector<HTMLElement>('[data-slot="sidebar-inset"] > main')?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-0 gap-8">
      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      <aside className="hidden w-52 shrink-0 lg:block">
        <div className="sticky top-4">
          <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Guide
          </p>
          <GuideNav />
        </div>
      </aside>

      {/* ── Mobile nav toggle ─────────────────────────────────────────────────── */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen((o) => !o)}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          aria-label="Toggle guide navigation"
        >
          {mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          {mobileNavOpen ? 'Close' : 'Contents'}
        </button>

        {mobileNavOpen && (
          <div
            className="mb-6 rounded-xl border border-border/60 bg-background/80 p-4 shadow-sm"
            onClick={() => {
              setMobileNavOpen(false);
              // let NavLink navigate
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') setMobileNavOpen(false); }}
          >
            <GuideNav />
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <main className={cn('min-w-0 flex-1', mobileNavOpen && 'hidden lg:block')}>
        <MarkdownPage content={content} />
      </main>
    </div>
  );
}
