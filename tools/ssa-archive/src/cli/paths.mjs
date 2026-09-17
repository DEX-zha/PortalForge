// Locations resolved from this module rather than from the caller's working directory, so a command behaves
// the same wherever it is started from.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(here, '../../../..');
export const docsDir = path.join(repoRoot, 'docs');
export const localDir = path.join(repoRoot, '.local');
const samplesDir = path.join(localDir, 'samples/DATA/files');

// The extracted original of a disc file, used as the baseline for diffs and identical-file detection.
export const sampleOf = discPath => path.join(samplesDir, ...String(discPath).split('/'));
