import express from "express";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./routes.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  app.use("/agent", express.static(fileURLToPath(new URL("../../agent", import.meta.url))));
  return app;
}
