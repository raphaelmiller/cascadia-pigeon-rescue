# syntax=docker/dockerfile:1.7
# -----------------------------------------------------------------------------
# Cascadia Pigeon Rescue — production Dockerfile
#
# Multi-stage so the final image only carries the compiled .next output, the
# Prisma client, the migrations folder, and runtime node_modules — no source,
# no devDependencies, no build cache.
# -----------------------------------------------------------------------------

ARG NODE_VERSION=22

# -----------------------------------------------------------------------------
# Stage 1 — install all deps (incl. dev) for the build step.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# Compatibility for native modules under musl (better-sqlite3, sharp, etc.).
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# -----------------------------------------------------------------------------
# Stage 2 — build the Next.js standalone output.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client against the schema we ship.
RUN npx prisma generate

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3 — runtime image. Only what the server needs at boot.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Drop privileges — Next runs fine as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs \
 && chown -R nextjs:nodejs /app

# We don't use Next's `output: 'standalone'` because Prisma's client + the
# libSQL adapter want the full node_modules tree available at runtime.
# Copy the production deps and the built artifacts.
# --chown ensures the nextjs user can actually read these at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/package.json       ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json* ./package-lock.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules       ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next              ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public             ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma             ./prisma

# Migration runner for libSQL/Turso (invoked by `prod:start`).
COPY --from=builder --chown=nextjs:nodejs /app/scripts            ./scripts

# next.config.ts is referenced by `next start` at boot.
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

USER nextjs
EXPOSE 3000

# Run the migrations then start. `prod:start` is defined in package.json.
CMD ["npm", "run", "prod:start"]
