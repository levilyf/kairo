#!/usr/bin/env node
/**
 * kairo CLI bin entrypoint.
 *
 * Calls into the program runner and exits with the returned exit code.
 * Kept as tiny as possible so package bundlers / standalone node can
 * treat it as a script.
 */

import { main } from "./program.js";

const argv = process.argv.slice(2);
main(argv).then((code) => process.exit(code));
