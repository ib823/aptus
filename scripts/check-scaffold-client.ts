/**
 * pnpm check:scaffold-client — does the starter kit's generated client.ts
 * compile under `strict` (and the stricter flags beside it)?
 *
 * A CI step (Quality Gates). Exit 0 when every generated variant compiles
 * under every configuration; exit 1 with the diagnostics otherwise. See
 * scripts/lib/scaffold-client-check.ts for what is compiled and why.
 */

import { checkGeneratedClients, clientVariants, compilerConfigs } from "./lib/scaffold-client-check";

const failures = checkGeneratedClients();
const total = clientVariants().length * compilerConfigs().length;

if (failures.length > 0) {
  for (const f of failures) {
    console.error(`\n✗ ${f.variant} — ${f.config}`);
    for (const d of f.diagnostics.slice(0, 10)) console.error(`    ${d}`);
    if (f.diagnostics.length > 10) console.error(`    … and ${f.diagnostics.length - 10} more`);
  }
  console.error(`\n${failures.length} of ${total} generated-client compilations failed.`);
  process.exit(1);
}

console.log(`Generated client.ts compiles cleanly: ${total} compilations (variants × configurations).`);
