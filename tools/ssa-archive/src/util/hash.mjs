// SHA-256 digests. Every artefact this project compares across runs - archives, entries, patches, save
// states - is identified by one, so there is a single definition of how it is computed.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

export const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
export const sha256File = file => sha256(fs.readFileSync(file));
