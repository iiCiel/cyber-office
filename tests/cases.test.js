// Every Case File must be complete, consistent with its own logs, and honest about its sources.
import { CASES, getCase } from '../src/cases/index.js';
import { checkCase } from './helpers/caseChecks.js';

for (const c of CASES) checkCase(c, { getCase });
