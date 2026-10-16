FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

RUN addgroup -S app && adduser -S -G app -u 1001 app && chown -R app:app /app
USER app

ENV NODE_ENV=production PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
