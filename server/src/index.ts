import "./env.js";
import { createApp } from "./app.js";
import { seed } from "./store.js";
import { getApiKey, liveSettings } from "./gemini.js";

const PORT = Number(process.env.API_PORT ?? 3000);

seed();

createApp().listen(PORT, () => {
  const { model, apiVersion } = liveSettings();
  console.log(`API on http://localhost:${PORT}`);
  console.log(`GEMINI_API_KEY: ${getApiKey() ? "set" : "MISSING — voice calls will fail (board still works)"}`);
  console.log(`Gemini Live model: ${model} (${apiVersion})`);
});
