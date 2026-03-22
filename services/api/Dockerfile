FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/sdk/package.json      packages/sdk/
COPY packages/types/package.json    packages/types/
COPY packages/database/package.json packages/database/
COPY services/api/package.json      services/api/

RUN pnpm install --frozen-lockfile --filter @fairdrop/api...

# ── Source ────────────────────────────────────────────────────────────────────
FROM deps AS app
WORKDIR /app

COPY packages/ packages/
COPY services/api/ services/api/

EXPOSE 3001

CMD ["pnpm", "--filter", "@fairdrop/api", "start"]
