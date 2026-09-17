// `shot` and `corpus`: evidence that does not depend on someone looking at a screen.
//   shot    compares two boot screenshots pixel by pixel, so a visible effect is a measurement
//   corpus  runs the frozen placement model over several levels and reports rates and schema conformance
import fs from 'node:fs';
import path from 'node:path';
import { CliError, EXIT, need } from '../errors.mjs';
import { pickSubcommand } from '../dispatch.mjs';

const DIFF_THRESHOLD = 45; // per-channel difference below which two pixels count as equal
const DIFF_MIN_PIXELS = 60; // clusters smaller than this are noise
const CROP_MARGIN = 40; // pixels kept around a diff cluster
const DEFAULT_ZOOM = 3;

function shotDiff(P, pos, o) {
  const baseline = P.decode(path.resolve(need(pos[1], 'baseline png')));
  const candidate = P.decode(path.resolve(need(pos[2], 'png to compare')));
  const boxes = P.diffBoxes(
    baseline,
    candidate,
    o.threshold ? Number(o.threshold) : DIFF_THRESHOLD,
    o.min ? Number(o.min) : DIFF_MIN_PIXELS,
  );

  const files = [];
  if (o.out && boxes.length) {
    const index = o.box ? Number(o.box) : 0;
    const box = boxes[index];
    if (!box) throw new CliError(`no diff cluster #${index} (found ${boxes.length})`);
    const zoom = o.zoom ? Number(o.zoom) : DEFAULT_ZOOM;
    const base = path.resolve(o.out).replace(/\.png$/i, '');
    const region = image =>
      P.crop(image, box.x - CROP_MARGIN, box.y - CROP_MARGIN, box.w + 2 * CROP_MARGIN, box.h + 2 * CROP_MARGIN, zoom);
    files.push(P.encode(region(candidate), base + '-new.png'));
    files.push(P.encode(region(baseline), base + '-base.png'));
  }

  const lines = [
    `${baseline.w}x${baseline.h}; ${boxes.length} diff cluster(s)`,
    ...boxes.slice(0, 10).map((b, i) => `  [${i}] x${b.x} y${b.y} ${b.w}x${b.h} ${b.pixels} px`),
    ...files,
  ];
  return { result: { size: [baseline.w, baseline.h], boxes, files }, text: lines.join('\n') };
}

function shotCrop(P, pos, o) {
  const image = P.decode(path.resolve(need(pos[1], 'png')));
  const [x, y, w, h] = need(o.region, 'region').split(',').map(Number);
  const zoom = o.zoom ? Number(o.zoom) : DEFAULT_ZOOM;
  const file = P.encode(P.crop(image, x, y, w, h, zoom), path.resolve(need(o.out, 'out')));
  return { result: { file }, text: file };
}

const SHOT_SUBCOMMANDS = { diff: shotDiff, crop: shotCrop };

export async function shot(pos, o) {
  const P = await import('../../evidence/png.mjs');
  const handler = pickSubcommand(SHOT_SUBCOMMANDS, pos[0], name => `Unknown shot subcommand ${name} (diff|crop)`);
  return handler(P, pos, o);
}

// `--fixups <igz file>=<fixup map>` attaches a runtime map to one file for a ground-truth check.
function parseCorpusFixups(value) {
  const fixups = {};
  for (const spec of value ? [value].flat() : []) {
    const at = spec.lastIndexOf('=');
    if (at < 0) throw new CliError('corpus --fixups expects <igz file>=<fixup map>', EXIT.USAGE);
    fixups[path.resolve(spec.slice(0, at))] = JSON.parse(fs.readFileSync(path.resolve(spec.slice(at + 1)), 'utf8'));
  }
  return fixups;
}

export async function corpus(pos, o) {
  const C = await import('../../igz/corpus.mjs');
  const files = pos.map(p => path.resolve(p));
  if (!files.length) throw new CliError('corpus needs at least one decoded IGZ file', EXIT.USAGE);
  const report = C.corpusReport(files, { fixups: parseCorpusFixups(o.fixups) });
  if (o.out) fs.writeFileSync(path.resolve(o.out), JSON.stringify(report, null, 2));
  const failed = report.totals.schema_invalid > 0 || report.totals.failed > 0;
  return {
    result: report,
    exitCode: failed ? EXIT.FAILED : EXIT.OK,
    text: C.formatCorpus(report) + (o.out ? '\nreport ' + path.resolve(o.out) : ''),
  };
}
