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
import adlab2026 from './adlab2026/index.js';
import awslab2026 from './awslab2026/index.js';
import midnightblizzard2024 from './midnightblizzard2024/index.js';
import notpetya2017 from './notpetya2017/index.js';
import linuxlab2026 from './linuxlab2026/index.js';
import beclab2026 from './beclab2026/index.js';
import solarwinds2020 from './solarwinds2020/index.js';
import php2shell2026 from './php2shell2026/index.js';
import { PLAYBOOKS } from './playbooks.js';

// Newest first: php2shell-2026 is the "just happened" case.
export const CASES = [php2shell2026, uber2022, mgm2023, colonial2021, target2013, equifax2017, capitalone2019, moveit2023, change2024, adlab2026, awslab2026, midnightblizzard2024, notpetya2017, linuxlab2026, beclab2026, solarwinds2020];

// The Attacker's Playbook (src/cases/playbooks.js) is the offence side of each case: how the intrusion
// actually progressed, step by step. Attached here so a case file can carry it without editing every case.
// A case may also define caseFile.attackerView inline; that wins.
for (const c of CASES) {
  const pb = PLAYBOOKS[c.caseFile.id];
  if (pb && !c.caseFile.attackerView) c.caseFile.attackerView = pb;
}

export const getCase = (id) => CASES.find((c) => c.caseFile.id === id) || uber2022; // unknown ids fall back to the first case ever written, not the newest

// On the roadmap: shown as locked cards in the Case Files menu.
const soon = (id, company, when, title, pitch, tags) => ({ comingSoon: true, caseFile: { id, company, when, title, pitch, tags, difficulty: 'Coming soon' } });
export const COMING_SOON = [
  // soon('next-case-id', 'Company', 'When', 'Title', 'One-line pitch', ['Tag', 'Tag']),
];
