// Shared pieces for the Learn-mode lessons.
import { TEAM } from './ccdcLabMidwest.js';

export const NAT = (x) => `172.25.${20 + TEAM}.${x}`;
export const PW = 'Prairie-Lantern-47-Oak';
export const PW2 = 'Copper-Thistle-92-Barn';
export const adPw = (who) => `Set-ADAccountPassword -Identity ${who} -Reset -NewPassword (ConvertTo-SecureString '${PW2}' -AsPlainText -Force)`;

export const login = (vm, name, user = 'root') => ({
  vm, say: `Open the ${name} console and log in as ${user} with password Changeme123. Nothing shows while you type a password. That is normal.`,
  done: (c) => c.loggedIn(vm), after: 'You are in.',
});
export const winLogin = (vm, name) => ({
  vm, say: `Open the ${name} console. Windows waits at a lock screen. Click the small arrow on the ${name} button, choose Send CTRL+ALT+DEL, and sign in with Changeme123. Then open PowerShell from the taskbar inside the VM (the blue icon).`,
  done: (c) => c.loggedIn(vm), after: 'You are at the desktop.',
});
export const waitCommit = (vm) => ({ vm, say: 'Run this until the job says FIN and OK. A commit takes a while.', type: 'show jobs all', done: (c) => c.ran(vm, /^show jobs/) && !c.st.devState[vm].firewall.pendingCommit, simWait: true, after: 'Committed.' });
