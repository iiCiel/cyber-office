// The simulated red-team engagements the player can run from the title screen. Each is a self-contained
// scripted pentest of fictional Halcyon Mutual (own seed, date, attacker host, noise generator and flag);
// EngageScene + src/game/engage.js drive any of them. Add a new engagement here and it appears in the picker.
import { ENGAGEMENT } from './halcyon-engagement.js';
import { WEB_ENGAGEMENT } from './halcyon-web-engagement.js';
import { PHISH_ENGAGEMENT } from './halcyon-phish-engagement.js';
import { AD_ENGAGEMENT } from './halcyon-ad-engagement.js';
import { CLOUD_ENGAGEMENT } from './halcyon-cloud-engagement.js';

export const ENGAGEMENTS = [ENGAGEMENT, WEB_ENGAGEMENT, PHISH_ENGAGEMENT, CLOUD_ENGAGEMENT, AD_ENGAGEMENT];

// Picker metadata: category (filter chip), level (badge, 1-3 pips) and the one skill each teaches.
export const CATEGORIES = ['Network', 'Web app', 'Social engineering', 'Cloud', 'Active Directory'];
export const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
export const ENGAGEMENT_META = {
  'halcyon-ext-2026': { category: 'Network', level: 'Beginner', skill: 'Recon, exposed services and password reuse', icon: 'NET' },
  'halcyon-web-2026': { category: 'Web app', level: 'Beginner', skill: 'OWASP A03 Injection, end to end', icon: 'WEB' },
  'halcyon-phish-2026': { category: 'Social engineering', level: 'Intermediate', skill: 'Phishing, MFA fatigue and identity logs', icon: 'PHI' },
  'halcyon-cloud-2026': { category: 'Cloud', level: 'Advanced', skill: 'SSRF to cloud credentials (Capital One pattern)', icon: 'AWS' },
  'halcyon-ad-2026': { category: 'Active Directory', level: 'Advanced', skill: 'Kerberoasting to domain compromise', icon: 'AD' },
};
export const metaFor = (e) => ENGAGEMENT_META[e.id] || { category: 'Network', level: 'Intermediate', skill: '', icon: '???' };
