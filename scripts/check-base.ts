// Stops "npm run dist" early if the base database is missing.
import { existsSync, statSync } from 'node:fs';

const file = 'resources/base.db';
if (!existsSync(file)) {
  console.error('✖ resources/base.db fehlt. Zuerst "npm run build-base-db" ausführen (ca. 1 Stunde).');
  process.exit(1);
}
console.log(`✔ resources/base.db gefunden (${(statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);
