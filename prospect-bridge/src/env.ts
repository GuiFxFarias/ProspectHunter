import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Carrega o .env da raiz do prospect-bridge, independente do cwd com que o
// Claude inicia o processo. dist/env.js → ../.env
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "..", ".env") });
