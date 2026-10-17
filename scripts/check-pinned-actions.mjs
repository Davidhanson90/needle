// Fails if any `uses:` in .github/workflows references an action by tag/branch instead of a full commit SHA.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = '.github/workflows';
const sha = /^[0-9a-f]{40}$/;
const problems = [];
for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    readFileSync(join(dir, file), 'utf8')
        .split('\n')
        .forEach((line, index) => {
            const match = line.match(/^\s*(?:-\s+)?uses:\s*([^\s#]+)/);
            if (!match || match[1].startsWith('./') || match[1].startsWith('docker://')) {
                return;
            }
            const ref = match[1].split('@')[1];
            if (!ref || !sha.test(ref)) {
                problems.push(`${file}:${index + 1}  ${match[1]} is not pinned to a commit SHA`);
            }
        });
}
if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
}
console.log('All workflow actions are pinned to commit SHAs.');
