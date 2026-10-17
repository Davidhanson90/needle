import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, merge, toMarkdown } from './bench-compare.mjs';

const doc = (benches) => ({
    files: [{ filepath: 'x', groups: [{ fullName: 'bench/x.bench.ts > Suite', benchmarks: Object.entries(benches).map(([name, [hz, rme = 1]]) => ({ name, hz, rme })) }] }],
});

test('identical results are fine', () => {
    const { regressions } = compare([doc({ a: [1000] })], [doc({ a: [1000] })]);
    assert.deepEqual(regressions, []);
});

test('a small slowdown within tolerance passes', () => {
    const { regressions } = compare([doc({ a: [1000] })], [doc({ a: [850] })], 25);
    assert.deepEqual(regressions, []);
});

test('a slowdown beyond tolerance fails', () => {
    const { regressions, rows } = compare([doc({ a: [1000] })], [doc({ a: [500] })], 25);
    assert.equal(regressions.length, 1);
    assert.equal(rows[0].status, 'regression');
    assert.ok(Math.abs(rows[0].changePercent + 50) < 1e-9);
});

test('a slowdown inside the margin of error is treated as noise', () => {
    const { regressions } = compare([doc({ a: [1000, 20] })], [doc({ a: [700, 20] })], 25);
    assert.deepEqual(regressions, []);
});

test('speed ups, new and removed benchmarks never fail', () => {
    const { regressions, rows } = compare([doc({ a: [1000], gone: [5] })], [doc({ a: [3000], fresh: [5] })], 25);
    assert.deepEqual(regressions, []);
    assert.deepEqual(rows.map((r) => r.status).sort(), ['faster', 'new', 'removed']);
});

test('multiple runs use the median, so one noisy run does not fail the build', () => {
    const base = [doc({ a: [1000] }), doc({ a: [1000] }), doc({ a: [1000] })];
    const head = [doc({ a: [1000] }), doc({ a: [200] }), doc({ a: [990] })];
    assert.equal(merge(head).get('bench/x.bench.ts > Suite > a').hz, 990);
    assert.deepEqual(compare(base, head, 25).regressions, []);
});

test('markdown mentions regressions', () => {
    const result = compare([doc({ a: [1000] })], [doc({ a: [100] })], 25);
    assert.match(toMarkdown(result, 25), /1 regression/);
});
