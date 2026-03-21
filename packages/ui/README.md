# @fairdrop/ui

Shared React component library. Built on [shadcn/ui](https://ui.shadcn.com) primitives with Tailwind v4 — components are copied into this package and owned here, not imported from shadcn at runtime.

Used by `apps/web`. Add new shadcn components via:

```bash
cd packages/ui
pnpm dlx shadcn@latest add <component>
```

Components land in `src/components/ui/`. Wrap them with fairdrop-specific variants in `src/components/` before exporting.

Providers (theme, toast) live in `src/providers/`. Shared hooks (non-business logic) in `src/hooks/`. Global styles in `src/styles/`.
