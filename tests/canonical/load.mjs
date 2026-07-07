// Canonical data loader (tests/canonical/README.md rule 2): every protocol-shaped
// canonical file is proven through its zod schema at the moment of use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CANONICAL_DIR = path.dirname(fileURLToPath(import.meta.url));

export function loadCanonical(relPath, schema) {
  const raw = fs.readFileSync(path.join(CANONICAL_DIR, relPath), 'utf8');
  return schema.parse(JSON.parse(raw));
}
