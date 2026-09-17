// Exploration run used to record the tutorial-entry input script (task T038): boots the plain
// dump, loads the figure, replays a candidate script and keeps a labelled screenshot per step.
import fs from 'node:fs';
import path from 'node:path';
import { GameSession, gameFromConfig, readScript, defaultScript, evidence } from './run-game.mjs';

export async function explore({
  script = defaultScript,
  figure,
  label = 'explore',
  game = gameFromConfig(),
  target = null,
} = {}) {
  const session = await new GameSession().connect();
  const report = { label, started: new Date().toISOString(), script: path.resolve(script), steps: [], shots: [] };
  try {
    await session.launch(target ?? game, label);
    report.steps = await session.runScript(readScript(script), {
      labelPrefix: label,
      onShot: f => report.shots.push(f),
      figure,
    });
    report.monitor_tutorial = session.monitorLines('level/Level_027_Tutorial.arc');
    report.status = 'DONE';
  } catch (e) {
    report.status = 'FAIL';
    report.error = e.message;
  } finally {
    report.stop = await session.stop();
    await session.close();
    report.finished = new Date().toISOString();
    fs.mkdirSync(evidence, { recursive: true });
    const out = path.join(evidence, `${label}.json`);
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    report.output = out;
  }
  return report;
}
