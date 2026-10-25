// Browser-test plan for the PHP2Shell 2026 case (same shape as PLANS in scripts/smoke-case.mjs).
export default {
  id: 'php2shell-2026',
  report: ['scanner-phish'],
  steps: [
    { label: 'web admin: contain and hunt, or just patch?', walkup: [1] },
    { tickets: { 'upload-progress': 'ini', legacy74: 'offline', 'hide-version': 'inventory' } },
  ],
  terminalAfterAlert: true,
  terminal: { cmd: 'grep -r PHP_SESSION_UPLOAD_PROGRESS /mnt/agentportal/logs', expect: 'PHP_SESSION_UPLOAD_PROGRESS' },
  afterAlert: [{ label: 'agent support: are we hacked?', phone: [2, 1] }],
  search: ['PHP_SESSION_UPLOAD_PROGRESS', 'Allowed memory size', 'class-wp-cache-helper'],
  verdict: 'php2shell',
  actions: ['isolate', 'hunt', 'rebuild', 'rotate', 'inventory', 'mitigate', 'comms'],
};
