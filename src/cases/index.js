// Case Files: recreations of real, publicly documented breaches. Each case is a "day" for the same
// engine as the week (src/days/index.js documents the fields), plus a caseFile block:
//
//   caseFile { id, company, when, title, pitch, tags[], difficulty, headline,
//              timeline [{when, what}], realOutcome [lines], failures [lines],
//              attack [{id: 'T1621', name, fix}], resume (with {grade}), sources [{title, url}], disclaimer }
//
// Rules for writing a case: every attacker move must come from a cited source; anything only the attacker
// claimed is labeled as such; real people inside the company are never named; internal hostnames, users
// and IPs are stand-ins (documentation IP ranges); real IOCs are fine when an official advisory published them.
import uber2022 from './uber2022/index.js';
import mgm2023 from './mgm2023/index.js';
import colonial2021 from './colonial2021/index.js';
import target2013 from './target2013/index.js';
import equifax2017 from './equifax2017/index.js';
import moveit2023 from './moveit2023/index.js';
import change2024 from './change2024/index.js';
import capitalone2019 from './capitalone2019/index.js';

export const CASES = [uber2022, mgm2023, colonial2021, target2013, equifax2017, capitalone2019, moveit2023, change2024];

export const getCase = (id) => CASES.find((c) => c.caseFile.id === id) || CASES[0];

// On the roadmap: shown as locked cards in the Case Files menu.
const soon = (id, company, when, title, pitch, tags) => ({ comingSoon: true, caseFile: { id, company, when, title, pitch, tags, difficulty: 'Coming soon' } });
export const COMING_SOON = [
  soon('solarwinds-2020', 'SolarWinds', 'Sept 2019 - Dec 2020', 'The update everyone trusted', 'Attackers slip malicious code into a signed software update that thousands of organizations install.', ['Supply chain', 'Build system', 'APT29']),
];
