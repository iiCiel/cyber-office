// Browser-test plan for the Halcyon Linux lab (same shape as PLANS in scripts/smoke-case.mjs).
export default {
  id: 'halcyon-linux-2026',
  report: ['hosting-phish'],
  steps: [
    { label: 'the rooted server walk-up', walkup: [1] },
    { tickets: { 'wwwdata-sudo': 'remove', egress: 'deny', uploads: 'harden' } },
  ],
  terminal: { cmd: 'grep -i sudo /var/log/remote/web02/sudo.log', expect: 'www-data' },
  terminalAfterAlert: true,
  search: ['status.php', 'sudo www-data', 'name="/etc/shadow"', 'name="/root/.aws/credentials"', 'Accepted publickey for root', 'bytes_out=188743680'],
  verdict: 'chain',
  actions: ['isolate', 'keys', 'sudo', 'rebuild', 'patch', 'egress', 'ir'],
};
