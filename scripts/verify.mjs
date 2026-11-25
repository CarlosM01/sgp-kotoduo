#!/usr/bin/env node
// Runs lint, typecheck and tests from the terminal and saves a dated log in
// evidencias/ejecuciones/ so each run can be cited as test evidence.
// Every step runs even if a previous one fails; the exit code is non-zero
// when any step fails.

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logDirRelative = 'evidencias/ejecuciones';
const outDir = join(root, logDirRelative);

const steps = [
  { name: 'lint', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'typecheck', cmd: 'npm', args: ['run', 'typecheck'] },
  { name: 'test', cmd: 'npm', args: ['test'] },
];

// Returns the trimmed output, or null when git is missing or fails.
function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Logs are committed to a public repository: replace local absolute paths
// (project root and home directory) so they do not expose the user's machine.
const home = os.homedir();
function redact(text) {
  let out = text.split(root).join('<repo>');
  if (home && home !== '/') out = out.split(home).join('~');
  return out;
}

// Logs are cited in the report, so they must not contain ANSI color codes.
function withoutForceColor(env) {
  const { FORCE_COLOR: _ignored, ...rest } = env;
  return rest;
}

// Opens a new log file without ever overwriting an earlier one.
function openNewLog(baseName) {
  for (let i = 1; i < 100; i++) {
    const name = i === 1 ? `${baseName}.log` : `${baseName}_${i}.log`;
    const path = join(outDir, name);
    try {
      return { fd: openSync(path, 'wx'), path };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  throw new Error('too many logs with the same name');
}

const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const commit = git(['rev-parse', '--short', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
// Earlier logs in evidencias/ejecuciones/ do not count as changes to the
// code under test, so a second run before committing them still reports clean.
const status = git(['status', '--porcelain', '--', '.', `:(exclude)${logDirRelative}`]);
const dirty =
  status === null ? 'unknown (git unavailable)' : status ? 'yes (uncommitted changes)' : 'no';

let logFd = null;
let logPath = null;
try {
  mkdirSync(outDir, { recursive: true });
  ({ fd: logFd, path: logPath } = openNewLog(`verify_${stamp}_${commit ?? 'unknown'}`));
} catch (err) {
  process.stderr.write(`WARNING: cannot create the log file (${err.message}); output goes to the terminal only.\n`);
}

function write(text) {
  const clean = redact(text);
  process.stdout.write(clean);
  if (logFd === null) return;
  try {
    writeSync(logFd, clean);
  } catch (err) {
    process.stderr.write(`WARNING: cannot write the log file (${err.message}); output goes to the terminal only.\n`);
    logFd = null;
  }
}

function runStep(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    // Node can emit 'error' and then 'close' for the same failed spawn;
    // only the first event writes the step trailer.
    const finish = (code, detail) => {
      if (settled) return;
      settled = true;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      write(`----- ${step.name}: ${detail} (${seconds}s) -----\n`);
      resolve({ name: step.name, code, seconds });
    };
    write(`\n===== ${step.name}: ${step.cmd} ${step.args.join(' ')} =====\n`);
    const child = spawn(step.cmd, step.args, {
      cwd: root,
      shell: process.platform === 'win32',
      env: { ...withoutForceColor(process.env), NO_COLOR: '1' },
    });
    child.stdout.on('data', (d) => write(d.toString()));
    child.stderr.on('data', (d) => write(d.toString()));
    child.on('error', (err) => finish(-1, `failed to start (${err.message})`));
    child.on('close', (code, signal) =>
      finish(code ?? -1, signal ? `killed by ${signal}` : `exit ${code}`),
    );
  });
}

write('SGP-Kotoduo - verification run\n');
write(`Date:        ${now.toLocaleString('sv-SE')} local (${now.toISOString()} UTC)\n`);
write(`Branch:      ${branch ?? 'unknown'}\n`);
write(`Commit:      ${commit ?? 'unknown'}\n`);
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
write(logPath ? `Log: ${relative(root, logPath)}\n` : 'Log: not written\n');

if (logFd !== null) closeSync(logFd);
process.exit(failed === 0 ? 0 : 1);
