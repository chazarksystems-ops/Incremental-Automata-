// Recompute every core fixture with our engine and diff against the committed
// expectations (generated independently by reference_lifelib.py).
// Never "fix" a failure by editing expected hashes — see CLAUDE.md invariant 6.
import { loadFixtures, runFixture } from './fixtures';

let failed = 0;
let checkpoints = 0;
for (const spec of loadFixtures()) {
  const results = runFixture(spec);
  checkpoints += results.length;
  const bad = results.filter((r) => !r.pass);
  failed += bad.length;
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${spec.id.padEnd(24)} ${results.length} checkpoints  [ref: ${spec.reference?.tool ?? 'none'}]`);
  for (const b of bad) {
    console.log(`     gen ${b.generation}: expected ${JSON.stringify(b.expected)} got ${JSON.stringify(b.actual)}`);
  }
}
console.log(`\n${checkpoints - failed}/${checkpoints} checkpoints match the reference`);
process.exit(failed ? 1 : 0);
