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

export const CASES = [uber2022, mgm2023, colonial2021];

export const getCase = (id) => CASES.find((c) => c.caseFile.id === id) || CASES[0];

// On the roadmap: shown as locked cards in the Case Files menu.
const soon = (id, company, when, title, pitch, tags) => ({ comingSoon: true, caseFile: { id, company, when, title, pitch, tags, difficulty: 'Coming soon' } });
export const COMING_SOON = [
  soon('equifax-2017', 'Equifax', 'May-July 2017', 'The patch that never landed', 'An Apache Struts flaw with a fix already out, a scan that missed one portal, and an expired certificate that hid 76 days of data leaving.', ['Unpatched CVE', 'Web shells', 'Expired cert']),
  soon('target-2013', 'Target', 'Nov-Dec 2013', 'In through the HVAC vendor', "A heating contractor's stolen login, card-scraping malware on registers, and security alerts that fired and were never acted on.", ['Third-party access', 'POS malware', 'Ignored alerts']),
  soon('moveit-2023', 'MOVEit Transfer', 'May-June 2023', 'One SQL injection, 2,700+ organizations', 'Cl0p hits a file-transfer product over a holiday weekend, drops a web shell called human2.aspx, and steals data from thousands of organizations.', ['Zero-day', 'SQL injection', 'Cl0p']),
  soon('change-2024', 'Change Healthcare', 'February 2024', 'No MFA, no claims', 'Stolen credentials on a remote-access portal without MFA, nine quiet days inside, then ransomware that stalled pharmacy claims nationwide.', ['No MFA', 'Ransomware', 'Healthcare']),
];
