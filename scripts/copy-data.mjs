#!/usr/bin/env node
/**
 * Refresh the bundled catalog from the canonical one the agentcheck pages are built from:
 *
 *   pnpm --filter subprocessors data
 *
 * apps/agentcheck/src/app/subprocessors/_data/vendors.json → src/data/vendors.json. The CLI makes
 * no requests, so this copy is the catalog it runs with; src/catalog.test.ts fails while the two
 * differ.
 */
import { copyFileSync } from "node:fs";

const from = new URL("../../agentcheck/src/app/subprocessors/_data/vendors.json", import.meta.url);
const to = new URL("../src/data/vendors.json", import.meta.url);
copyFileSync(from, to);
console.log(`copied ${from.pathname} -> ${to.pathname}`);
