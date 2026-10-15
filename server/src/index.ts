import "./env.js";
import { createApp } from "./app.js";
import { seed } from "./store.js";

const PORT = Number(process.env.API_PORT ?? 3000);

seed();

createApp().listen(PORT, () => {
  const keySet = Boolean(process.env.XAI_API_KEY);
  console.log(`API on http://localhost:${PORT}`);
  console.log(`XAI_API_KEY: ${keySet ? "set" : "MISSING — voice calls will fail (board still works)"}`);
});
