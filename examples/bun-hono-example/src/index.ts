import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.text("Hello there!"));
app.get("/healthz", (c) => c.text("ok"));

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
