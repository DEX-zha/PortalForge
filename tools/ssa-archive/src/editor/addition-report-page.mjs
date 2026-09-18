// The HTML page that shows a family's tests and ordinary launches: verdict and full capture sequence.
// A person reads this page to judge what the automated checks cannot: whether the object is really there.
import path from 'node:path';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ESCAPES[character]);

const STYLE =
  'body{background:#20242b;color:#eee;font:16px system-ui;max-width:1100px;margin:30px auto;padding:20px}' +
  'img{max-width:100%;display:block;margin:14px 0}a{color:#9ed4ff}';

function runSection(run, runIndex, familyKey) {
  const captures = (run.screenshots ?? [])
    .map((file, shotIndex) => ({ file, shotIndex }))
    .map(
      capture =>
        `<p>${escapeHtml(path.basename(capture.file))}</p>` +
        `<img loading="lazy" alt="Game capture, run ${runIndex + 1}" src="/api/addition-report/${familyKey}/shot/${runIndex}/${capture.shotIndex}">`,
    )
    .join('');
  return `<h2>Run ${runIndex + 1}: ${escapeHtml(run.status)}</h2><p>${escapeHtml(run.id ?? run.started)}</p>${captures}`;
}

// `familyKey` has already been validated as 64 hexadecimal characters by the router.
export function renderAdditionReport(report, record, familyKey) {
  return (
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Addition test</title><style>${STYLE}</style>` +
    `<h1>${escapeHtml(report.name)}: ${escapeHtml(report.runtime)}</h1>` +
    `<p>${escapeHtml(report.reason)}</p>` +
    `<p>Visual: ${escapeHtml(report.visual)}. Gameplay: ${escapeHtml(report.gameplay)}. Runtime verification does not confirm a recipe or its rendering and gameplay.</p>` +
    (record.missing?.length ? `<p>Local evidence unavailable: ${record.missing.map(escapeHtml).join(', ')}.</p>` : '') +
    record.runs.map((run, index) => runSection(run, index, familyKey)).join('') +
    `<a href="/api/addition-report/${familyKey}">Technical report</a></html>`
  );
}
