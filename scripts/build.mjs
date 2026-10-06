import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../src/ha-kamado-card.js", import.meta.url),
  new URL("../dist/ha-kamado-card.js", import.meta.url),
);
