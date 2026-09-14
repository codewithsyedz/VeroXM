# Local-development container for the NestJS api.
#
# This runs the same dev server (`nest start --watch`) you'd run on the
# host with `npm run dev:api` — it is NOT a production build. See
# docs/DOCKER-DEV-SETUP.md for why, and what a real production image would
# need to change (a compiled `packages/db` output, a multi-stage build,
# `node dist/main` instead of the CLI watcher).
#
# Build context is the monorepo root (see docker-compose.yml `context: .`)
# because npm workspaces install once at the root for every workspace.
FROM node:22-bookworm-slim

WORKDIR /app

# Install git + openssl: prisma's engine download / query engine needs
# openssl at runtime on Debian slim images; git is occasionally needed by
# transitive installs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/sdk-js/package.json packages/sdk-js/package.json

# --legacy-peer-deps: required by an npm/arborist bug from NestJS's vitest
# peer deps (see README.md) — not Docker-specific, same flag used on the host.
RUN npm install --legacy-peer-deps

# Now bring in the rest of the source. Compose also bind-mounts the repo
# over this at runtime (see docker-compose.yml) so edits reload live; this
# COPY just makes `docker build` produce a runnable image on its own too.
COPY . .

# Prisma only needs the schema file to generate a client, not a live DB
# connection, so this is safe to do at build time.
RUN npm run db:generate

EXPOSE 4000

CMD ["npm", "run", "dev:api"]
