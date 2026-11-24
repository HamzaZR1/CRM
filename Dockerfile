FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app ./
VOLUME ["/app/data"]
EXPOSE 3000
# Creates/updates the schema on boot; seed demo data once with: docker compose exec zcrm npm run db:seed
CMD ["sh", "-c", "mkdir -p data && npx drizzle-kit push --force && npx next start -p 3000"]
