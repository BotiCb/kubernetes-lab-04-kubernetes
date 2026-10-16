# bun-hono-example

A minimal containerised [Bun](https://bun.sh) + [Hono](https://hono.dev) app.

It exposes two endpoints:

| Method | Path       | Response       |
| ------ | ---------- | -------------- |
| GET    | `/`        | `Hello there!` |
| GET    | `/healthz` | `ok`           |

The server listens on `PORT` (default `3000`).

## Files

```
.
├── Dockerfile        # single-stage multi-arch image, runs as non-root
├── .dockerignore
├── package.json
├── bun.lock
├── src/index.ts      # the whole app (~10 lines)
└── README.md
```

## Run locally (no Docker)

```sh
bun install
bun run src/index.ts
curl http://127.0.0.1:3000/         # -> Hello there!
curl http://127.0.0.1:3000/healthz  # -> ok
```

## Build locally

```sh
docker build -t bun-hono-example:dev .
docker run --rm -p 3000:3000 bun-hono-example:dev
curl http://127.0.0.1:3000/         # -> Hello there!
```

## Build + push a multi-arch image

> The Kubernetes cluster nodes are **arm64**. The image **must** therefore include
> `linux/arm64`, otherwise the pods will fail with an exec format error
> (`exec /usr/local/bin/bun: exec format error`).

Build for both `linux/amd64` and `linux/arm64` and push the manifest list in one step:

```sh
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t <registry>/<repo>:<tag> \
  --push .
```

Replace `<registry>/<repo>:<tag>` with your own target, e.g.
`registry.example.com/library/bun-hono-example:v1`.

To confirm what a pushed image contains:

```sh
docker buildx imagetools inspect <registry>/<repo>:<tag>
```

## Notes on the image

- Base image is `oven/bun:1-alpine`.
- The base image's default user is **root**, so the Dockerfile creates an explicit
  non-root user (`app`, uid 1001) and switches to it with `USER app`.
- Single-stage build: `bun install --frozen-lockfile --production`, then copy `src`.
- A health endpoint at `/healthz` is provided for Kubernetes liveness/readiness probes.
