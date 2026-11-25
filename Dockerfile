FROM node:24.11.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:24.11.0-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24.11.0-alpine AS migrate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts ./scripts
COPY src ./src
COPY supabase ./supabase
CMD ["node", "--experimental-strip-types", "scripts/migrate.ts"]

FROM node:24.11.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
