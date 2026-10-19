export default {
  id: 'change-2024',
  report: ['status-phish'],
  steps: [{ label: 'ransomware spreading', walkup: [1] }],
  terminalAfterAlert: true,
  terminal: { cmd: 'grep -i none /mnt/exports/remote/portals.csv', expect: 'cx-remote01' },
  afterAlert: [{ label: 'the ransom question', walkup: [1] }],
  search: ['mfa=none', 'vssadmin'],
  verdict: 'ransomware',
  actions: ['disable-acct', 'mfa-all', 'isolate', 'law', 'restore', 'creds', 'comms'],
};
