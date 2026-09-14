# Local-development container for the Next.js web app.
#
# Runs `next dev` (same as `npm run dev:web` on the host) — not a production
# build. See docs/DOCKER-DEV-SETUP.md for what a production image would
# need instead (`next build` + `output: "standalone"` + a slim runtime stage).
#
# Build context is the monorepo root (see docker-compose.yml `context: .`)
# because npm workspaces install once at the root for every workspace.
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run db:generate

EXPOSE 3000

CMD ["npm", "run", "dev:web"]
