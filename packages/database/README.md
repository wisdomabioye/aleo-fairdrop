# @fairdrop/database

Drizzle ORM schema, migrations, and DB client for the PostgreSQL database shared by `services/indexer` and `services/api`.

## Row types

Row types are inferred directly from the Drizzle schema — they cannot drift:

```ts
import type { AuctionRow, BidRow, NewBid } from '@fairdrop/database';

// InferSelectModel<typeof table>  → what queries return
// InferInsertModel<typeof table>  → what db.insert() accepts
```

`packages/types` has no `./db` sub-path. Import DB types from here, not from `@fairdrop/types`.

## Usage

```ts
import { createDb } from '@fairdrop/database';

const db = createDb(process.env.DATABASE_URL!);
// throws at startup if DATABASE_URL is empty
```

## Commands

```bash
pnpm db:generate   # generate migration from schema changes
pnpm db:migrate    # apply pending migrations
pnpm db:studio     # open Drizzle Studio
```

Set `DATABASE_URL` in your environment (see `.env.example` at repo root).
