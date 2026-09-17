// Every option the CLI accepts. `node:util` parseArgs is run in strict mode over this one table, so an option
// missing here is rejected before any command sees it. Options are grouped by the commands that read them;
// several are shared, and each is declared exactly once.
const string = { type: 'string' };
const strings = { type: 'string', multiple: true };
const flag = { type: 'boolean', default: false };

export const OPTIONS = {
  // General
  json: flag,
  help: { type: 'boolean', short: 'h', default: false },
  out: string,
  limit: string,
  force: flag,

  // Disc and archives: identify, disc-*, extract, rebuild, patch
  game: string,
  filter: string,
  path: string,
  'disc-path': string,
  decode: flag,
  replace: strings,
  layout: string,
  pad: string,
  'reencode-all': flag,
  experiment: string,
  'patch-out': string,

  // scan, bindiff
  range: string,
  vector: string,
  endian: string,
  min: string,
  context: string,

  // experiment
  archive: string,
  entry: string,
  offset: string,
  type: string,
  value: string,
  predict: string,
  repeat: string,
  figure: string,
  'input-script': string,
  script: string,
  label: string,
  variant: string,
  'skip-control': flag,
  watch: strings,
  pattern: strings,
  poke: strings,
  probe: strings,
  read: strings,
  'save-slot': string,
  base: string,
  address: string,
  file: string,
  'dump-section': flag,
  'dump-anchor': string,
  'dry-run': flag,

  // experiment m2-judge
  id: string,
  run: string,
  observed: string,
  match: string,
  replicates: strings,

  // findings
  category: string,
  to: string,
  summary: string,
  finding: string,
  'also-finding': strings,

  // igz: inspection
  histogram: flag,
  tol: string,
  dimensions: flag,
  'no-dimensions': flag,
  depth: string,
  fixups: strings,
  validate: { type: 'boolean' },
  near: string,
  layer: string,
  all: { type: 'boolean' },
  section: string,
  regions: string,
  'section-address': strings,

  // igz: clone, clone-entity
  set: strings,
  plan: string,
  end: string,
  keep: string,
  'append-to-list': flag,
  'no-register': flag,
  'no-refcounts': flag,
  'fresh-ids': flag,
  'replace-entry': string,
  'replace-node': string,
  'replace-record': string,
  'insert-before': string,
  'link-after': string,
  'link-field': string,
  overwrite: string,

  // edit
  pos: string,
  heading: string,
  scale: string,
  over: string,
  'allow-scripted': { type: 'boolean' },
  port: string,
  open: { type: 'boolean' },
  width: string,
  height: string,
  meshes: flag,
  eye: string,
  target: string,

  // shot
  threshold: string,
  zoom: string,
  box: string,
  region: string,
};
