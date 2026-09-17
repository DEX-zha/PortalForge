// Command registry: command name -> the module and export that implement it.
//
// Modules are imported on demand. The read-only commands have no reason to load the MCP client, the editor
// server or three.js, and a lazy registry keeps `ssa-archive gates` as quick as it looks.
const REGISTRY = {
  identify: ['./archive.mjs', 'identify'],
  'disc-list': ['./archive.mjs', 'discList'],
  'disc-extract': ['./archive.mjs', 'discExtract'],
  info: ['./archive.mjs', 'info'],
  list: ['./archive.mjs', 'list'],
  extract: ['./archive.mjs', 'extract'],
  verify: ['./archive.mjs', 'verify'],
  rebuild: ['./archive.mjs', 'rebuild'],
  diff: ['./archive.mjs', 'diff'],
  patch: ['./archive.mjs', 'patch'],
  scan: ['./scan.mjs', 'scan'],
  bindiff: ['./scan.mjs', 'bindiff'],
  igz: ['./igz.mjs', 'igz'],
  edit: ['./edit.mjs', 'edit'],
  experiment: ['./experiment.mjs', 'experiment'],
  findings: ['./findings.mjs', 'findings'],
  gates: ['./findings.mjs', 'gates'],
  corpus: ['./evidence.mjs', 'corpus'],
  shot: ['./evidence.mjs', 'shot'],
};

export const hasCommand = name => Object.hasOwn(REGISTRY, name);
export const commandNames = () => Object.keys(REGISTRY);

export async function loadCommand(name) {
  const [module, exported] = REGISTRY[name];
  return (await import(module))[exported];
}
