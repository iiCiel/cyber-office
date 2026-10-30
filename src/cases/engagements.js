// The simulated red-team engagements the player can run from the title screen. Each is a self-contained
// scripted pentest of fictional Halcyon Mutual (own seed, date, attacker host, noise generator and flag);
// EngageScene + src/game/engage.js drive any of them. Add a new engagement here and it appears in the picker.
import { ENGAGEMENT } from './halcyon-engagement.js';
import { WEB_ENGAGEMENT } from './halcyon-web-engagement.js';
import { AD_ENGAGEMENT } from './halcyon-ad-engagement.js';

export const ENGAGEMENTS = [ENGAGEMENT, WEB_ENGAGEMENT, AD_ENGAGEMENT];
