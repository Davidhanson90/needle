// Compares two sets of vitest benchmark results (base vs head) and fails on a meaningful slowdown.
//
// Usage: node scripts/bench-compare.mjs --base a1.json,a2.json --head b1.json,b2.json [--tolerance 25] [--summary out.md]
//
// Each side can be several runs; the median ops/sec per benchmark is used, which damps runner noise.
// A benchmark is a regression only if it is slower than the tolerance AND the slowdown is larger than the
// combined relative margin of error reported by vitest, so a noisy benchmark does not fail the build.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_TOLERANCE_PERCENT = 25;

const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Flattens one vitest `--outputJson` document into Map<"group > name", { hz, rme }> */
export function flatten(document) {
    const result = new Map();
    for (const file of document.files ?? []) {
        for (const group of file.groups ?? []) {
            for (const bench of group.benchmarks ?? []) {
                result.set(`${group.fullName} > ${bench.name}`, { hz: bench.hz, rme: bench.rme ?? 0 });
            }
        }
    }
    return result;
}

/** Merges several runs into one Map using the median hz (and median rme) per benchmark. */
export function merge(documents) {
    const runs = documents.map(flatten);
    const keys = new Set(runs.flatMap((run) => [...run.keys()]));
    const merged = new Map();
    for (const key of keys) {
        const samples = runs.map((run) => run.get(key)).filter(Boolean);
        merged.set(key, { hz: median(samples.map((s) => s.hz)), rme: median(samples.map((s) => s.rme)) });
    }
    return merged;
}

/**
 * @returns {{ rows: Array<{name:string, base?:number, head?:number, changePercent?:number, status:string}>, regressions: string[] }}
 */
export function compare(baseDocs, headDocs, tolerancePercent = DEFAULT_TOLERANCE_PERCENT) {
    const base = merge(baseDocs);
    const head = merge(headDocs);
    const rows = [];
    const regressions = [];
    for (const name of [...new Set([...base.keys(), ...head.keys()])].sort()) {
        const b = base.get(name);
        const h = head.get(name);
        if (!b || !h) {
            rows.push({ name, base: b?.hz, head: h?.hz, status: b ? 'removed' : 'new' });
            continue;
        }
        const changePercent = ((h.hz - b.hz) / b.hz) * 100;
        const noise = b.rme + h.rme; // vitest reports rme as a percentage
        const slower = -changePercent;
        let status = 'ok';
        if (slower > tolerancePercent && slower > noise) {
            status = 'regression';
            regressions.push(name);
        } else if (changePercent > tolerancePercent && changePercent > noise) {
            status = 'faster';
        }
        rows.push({ name, base: b.hz, head: h.hz, changePercent, status });
    }
    return { rows, regressions };
}

const fmt = (n) => (n === undefined ? '-' : Math.round(n).toLocaleString('en-GB'));
const ICONS = { ok: 'ok', faster: 'faster', regression: 'REGRESSION', new: 'new', removed: 'removed' };

export function toMarkdown({ rows, regressions }, tolerancePercent) {
    const lines = [
        '## Benchmark comparison (PR vs base)',
        '',
        `Median ops/sec across runs, measured on the same runner. Fails when a benchmark is more than ${tolerancePercent}% slower and the slowdown is bigger than the reported margin of error.`,
        '',
        '| Benchmark | Base (ops/s) | PR (ops/s) | Change | Status |',
        '| --- | ---: | ---: | ---: | --- |',
        ...rows.map((r) => `| ${r.name} | ${fmt(r.base)} | ${fmt(r.head)} | ${r.changePercent === undefined ? '-' : `${r.changePercent >= 0 ? '+' : ''}${r.changePercent.toFixed(1)}%`} | ${ICONS[r.status]} |`),
        '',
        regressions.length ? `**${regressions.length} regression(s):** ${regressions.join(', ')}` : '**No regressions beyond tolerance.**',
        '',
    ];
    return lines.join('\n');
}

function parseArgs(argv) {
    const args = { tolerance: Number(process.env.BENCH_TOLERANCE_PERCENT ?? DEFAULT_TOLERANCE_PERCENT) };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, '');
        args[key] = argv[i + 1];
    }
    args.tolerance = Number(args.tolerance);
    return args;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.base || !args.head || !Number.isFinite(args.tolerance)) {
        console.error('Usage: bench-compare.mjs --base a.json[,b.json] --head c.json[,d.json] [--tolerance 25] [--summary file.md]');
        process.exit(2);
    }
    const read = (list) => list.split(',').map((file) => JSON.parse(readFileSync(file, 'utf8')));
    const result = compare(read(args.base), read(args.head), args.tolerance);
    const markdown = toMarkdown(result, args.tolerance);
    console.log(markdown);
    if (args.summary) {
        writeFileSync(args.summary, markdown);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
    }
    process.exit(result.regressions.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main();
}
