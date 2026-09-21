# Build the registry JSON and the Astro SSR bundle, then serve it with bun.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Runtime carries production dependencies only; the server bundle needs astro's
# own transitive deps (cookie, devalue, unstorage, send, …).
FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && rm -rf /root/.bun/install/cache
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["bun", "./dist/server/entry.mjs"]
