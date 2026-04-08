import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const BASE = '/guide';

/**
 * Converts a relative .md link (as written in guide markdown files) to an
 * absolute /guide/... path suitable for React Router navigation.
 * Returns null for non-.md hrefs so they fall through to a plain <a>.
 */
function resolveGuideLink(href: string, currentKey: string): string | null {
  if (!href.endsWith('.md')) return null;

  // Build the virtual file path for the current guide key so we can resolve
  // relative hrefs against it using the URL API.
  // '' (overview)         → '00-overview.md'
  // 'auctions'            → 'auctions/README.md'   (section root)
  // 'auctions/dutch'      → 'auctions/dutch.md'    (leaf)
  let virtualFile: string;
  if (currentKey === '') {
    virtualFile = '00-overview.md';
  } else if (!currentKey.includes('/')) {
    virtualFile = `${currentKey}/README.md`;
  } else {
    virtualFile = `${currentKey}.md`;
  }

  try {
    const resolved = new URL(href, `http://x/${virtualFile}`);
    let path = resolved.pathname.slice(1); // strip leading /
    path = path.replace(/\.md$/, '');      // strip .md
    path = path.replace(/\/README$/, '');  // 'auctions/README' → 'auctions'
    return `${BASE}/${path}`;
  } catch {
    return null;
  }
}

interface MarkdownPageProps {
  content: string;
  className?: string;
}

export function MarkdownPage({ content, className }: MarkdownPageProps) {
  const { pathname } = useLocation();
  const currentKey = pathname === BASE ? '' : pathname.slice(BASE.length + 1);

  // Memoise so ReactMarkdown doesn't unmount/remount on unrelated re-renders.
  const components = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      a({ href, children, node: _node, ...props }: any) {
        if (href) {
          const to = resolveGuideLink(href as string, currentKey);
          if (to) return <Link to={to}>{children}</Link>;
        }
        return <a href={href} {...props}>{children}</a>;
      },
    }),
    [currentKey],
  );

  return (
    <article
      className={cn(
        // Base prose styles without the prose plugin — manual but explicit
        'min-w-0 max-w-none text-sm leading-7 text-foreground',
        '[&_h1]:mb-4 [&_h1]:mt-0 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground',
        '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:border-b [&_h2]:border-border/60 [&_h2]:pb-1.5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground',
        '[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground',
        '[&_p]:mb-4 [&_p]:text-muted-foreground',
        '[&_a]:text-sky-500 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-sky-400',
        '[&_ul]:mb-4 [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:space-y-1',
        '[&_ol]:mb-4 [&_ol]:ml-4 [&_ol]:list-decimal [&_ol]:space-y-1',
        '[&_li]:text-muted-foreground',
        '[&_strong]:font-semibold [&_strong]:text-foreground',
        '[&_code]:rounded [&_code]:bg-muted/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8em] [&_code]:text-foreground',
        '[&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-muted/50 [&_pre]:p-4',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_blockquote]:mb-4 [&_blockquote]:border-l-2 [&_blockquote]:border-sky-500/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
        '[&_hr]:my-6 [&_hr]:border-border/60',
        '[&_table]:mb-4 [&_table]:w-full [&_table]:text-sm',
        '[&_thead]:border-b [&_thead]:border-border/60',
        '[&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-foreground',
        '[&_td]:py-2 [&_td]:pr-4 [&_td]:text-muted-foreground [&_td]:align-top',
        '[&_tbody_tr]:border-b [&_tbody_tr]:border-border/30',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
