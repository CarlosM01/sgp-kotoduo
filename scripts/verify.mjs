#!/usr/bin/env node
// Runs lint, typecheck and tests from the terminal and saves a dated log in
// evidencias/ejecuciones/ so each run can be cited as test evidence.
// Every step runs even if a previous one fails; the exit code is non-zero
// when any step fails.

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'evidencias', 'ejecuciones');

const steps = [
  { name: 'lint', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'typecheck', cmd: 'npm', args: ['run', 'typecheck'] },
  { name: 'test', cmd: 'npm', args: ['test'] },
];

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}

const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const commit = git('rev-parse --short HEAD');
const branch = git('rev-parse --abbrev-ref HEAD');
const dirty = git('status --porcelain') ? 'yes (uncommitted changes)' : 'no';

mkdirSync(outDir, { recursive: true });
const logPath = join(outDir, `verify_${stamp}_${commit}.log`);
const log = createWriteStream(logPath);

function write(text) {
  process.stdout.write(text);
  log.write(text);
}

// Logs are cited in the report, so they must not contain ANSI color codes.
function withoutForceColor(env) {
  const { FORCE_COLOR: _ignored, ...rest } = env;
  return rest;
}

function runStep(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    write(`\n===== ${step.name}: ${step.cmd} ${step.args.join(' ')} =====\n`);
    const child = spawn(step.cmd, step.args, {
      cwd: root,
      shell: process.platform === 'win32',
      env: { ...withoutForceColor(process.env), NO_COLOR: '1' },
    });
    child.stdout.on('data', (d) => write(d.toString()));
    child.stderr.on('data', (d) => write(d.toString()));
    child.on('close', (code) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      write(`----- ${step.name}: exit ${code} (${seconds}s) -----\n`);
      resolve({ name: step.name, code, seconds });
    });
    child.on('error', (err) => {
      write(`----- ${step.name}: failed to start (${err.message}) -----\n`);
      resolve({ name: step.name, code: -1, seconds: '0.0' });
    });
  });
}

write('SGP-Kotoduo - verification run\n');
write(`Date:        ${now.toLocaleString('sv-SE')} local (${now.toISOString()} UTC)\n`);
write(`Branch:      ${branch}\n`);
write(`Commit:      ${commit}\n`);
write(`Dirty tree:  ${dirty}\n`);
write(`Node:        ${process.version}\n`);
write(`OS:          ${os.type()} ${os.release()} (${os.arch()})\n`);

const results = [];
for (const step of steps) {
  results.push(await runStep(step));
}

write('\n===== Summary =====\n');
for (const r of results) {
  write(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.name.padEnd(10)} exit ${r.code}  ${r.seconds}s\n`);
}
const failed = results.filter((r) => r.code !== 0).length;
write(failed === 0 ? 'Result: all steps passed\n' : `Result: ${failed} step(s) failed\n`);
write(`Log: ${relative(root, logPath)}\n`);

log.end(() => process.exit(failed === 0 ? 0 : 1));
