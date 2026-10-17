# Benchmarks and regression checks

Benchmarks live in `bench/` and run with [vitest bench](https://vitest.dev/guide/features.html#benchmarking).

```bash
npm run bench              # writes reports/bench/bench-results.json
npm run bench:report       # also builds the HTML report
npm run bench:ab -- --base ../needle-main --rounds 3   # compare this checkout with another one
```

## Regression check in CI

`.github/workflows/bench-regression.yml` runs on every pull request to `main`:

1. It checks out the pull request and its base commit side by side and installs both.
2. `scripts/bench-ab.mjs` runs the benchmarks for **both** on the **same runner**, alternating the order each round (default 3 rounds).
3. `scripts/bench-compare.mjs` takes the **median ops/sec per benchmark** for each side and compares them.
4. The job fails when a benchmark is more than the tolerance slower (default **25%**) **and** the slowdown is larger than the combined relative margin of error that vitest reports for the two runs. The comparison table is written to the job summary and the raw JSON is uploaded as the `bench-ab` artifact.

New and removed benchmarks and speed-ups never fail the job.

### Why not compare against a stored baseline?

Shared CI runners differ a lot between runs (CPU model, noisy neighbours), so a baseline recorded on one run is a poor yardstick for another. Measuring base and PR together on one machine cancels most of that out. On pushes to `main` the workflow additionally stores the full results as a `bench-main-<sha>` artifact (kept 90 days) so you can look at trends or compare by hand.

### Tuning

Repository variables (Settings > Secrets and variables > Actions > Variables), all optional:

| Variable | Default | Meaning |
| --- | --- | --- |
| `BENCH_TOLERANCE_PERCENT` | `25` | Allowed slowdown before failing |
| `BENCH_ROUNDS` | `3` | Rounds per side. More rounds means less noise and a longer job |

You can also run the workflow manually with a `tolerance` input. Locally, `BENCH_TOLERANCE_PERCENT=10 npm run bench:ab -- --base <dir>` works too.

### Limitations

- Micro-benchmarks are noisy. Two identical checkouts typically differ by up to about 15% per benchmark, which is why the default tolerance is generous. Tighten it if your runners are quieter, and treat a failure as "please re-run and look" before "this is slower".
- A genuine slowdown below the tolerance will not be caught, and a slowdown spread across many benchmarks is only caught per benchmark.
- If the base commit has no benchmarks or no `vitest.bench.config.ts`, the job fails. The script is always taken from the pull request.
- The comparison logic has its own tests: `npm run test:bench-compare`.
