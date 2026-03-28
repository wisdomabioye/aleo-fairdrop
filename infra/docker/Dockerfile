FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Copy workspace manifests for all packages needed by api + indexer
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json   packages/config/
COPY packages/sdk/package.json      packages/sdk/
COPY packages/types/package.json    packages/types/
COPY packages/database/package.json packages/database/
COPY services/api/package.json      services/api/
COPY services/indexer/package.json  services/indexer/

# Install deps for both services and their workspace dependencies
RUN pnpm install --frozen-lockfile --filter @fairdrop/api... --filter @fairdrop/indexer...

# ── Application ───────────────────────────────────────────────────────────────
FROM deps AS app
WORKDIR /app

RUN apk add --no-cache supervisor

COPY contracts/deployments/ contracts/deployments/
COPY packages/ packages/
COPY services/api/ services/api/
COPY services/indexer/ services/indexer/
COPY services/supervisord.conf /etc/supervisor/conf.d/services.conf

EXPOSE 3001

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/services.conf"]
