# @fairdrop/database

Drizzle ORM schema and migrations for the PostgreSQL database shared by `services/indexer` and `services/api`.

The column types in `schema/` mirror the row shapes in `@fairdrop/types/db` exactly — if you change a DB column, update both. The types package is the source of truth for shape; this package is the source of truth for the actual schema and migrations.

```bash
pnpm db:generate   # generate migration from schema changes
pnpm db:migrate    # apply pending migrations
pnpm db:studio     # open Drizzle Studio
```

## Status

Not yet implemented.
