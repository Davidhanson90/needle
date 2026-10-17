// A/B benchmark run: benchmarks a base checkout and the current checkout alternately on the same machine,
// then compares the medians. Usage: node scripts/bench-ab.mjs --base ../base [--rounds 3] [--tolerance 25]
// Both directories need their dependencies installed. Results are written to reports/bench-ab/.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (i % 2 === 0 ? [...acc, [v.replace(/^--/, ''), all[i + 1]]] : acc), []));
if (!args.base) {
    console.error('Usage: bench-ab.mjs --base <dir> [--rounds 3] [--tolerance 25]');
    process.exit(2);
}
const rounds = Number(args.rounds ?? 3);
const head = resolve('.');
const base = resolve(args.base);
const out = join(head, 'reports', 'bench-ab');
mkdirSync(out, { recursive: true });

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function bench(cwd, file) {
    const result = spawnSync(npx, ['vitest', 'bench', '--run', '--config', 'vitest.bench.config.ts', '--outputJson', file], { cwd, stdio: 'inherit' });
    if (result.status !== 0 || !existsSync(file)) {
        console.error(`Benchmark run failed in ${cwd}`);
        process.exit(1);
    }
}

const baseFiles = [];
const headFiles = [];
for (let i = 1; i <= rounds; i++) {
    // alternate the order each round so neither side always benefits from a warm or a busy machine
    const order = i % 2 ? ['base', 'head'] : ['head', 'base'];
    for (const side of order) {
        const file = join(out, `${side}-${i}.json`);
        console.log(`\n=== round ${i}/${rounds}: ${side} ===`);
        bench(side === 'base' ? base : head, file);
        (side === 'base' ? baseFiles : headFiles).push(file);
    }
}

const compare = spawnSync(
    process.execPath,
    [join(head, 'scripts', 'bench-compare.mjs'), '--base', baseFiles.join(','), '--head', headFiles.join(','), '--summary', join(out, 'summary.md'), ...(args.tolerance ? ['--tolerance', args.tolerance] : [])],
    { stdio: 'inherit' },
);
process.exit(compare.status ?? 1);
