// Browser-test plan for the MOVEit 2023 case (same shape as PLANS in scripts/smoke-case.mjs).
export default {
  id: 'moveit-2023',
  report: ['hotfix'],
  steps: [{ label: 'MOVEit admin: block and hunt, or just patch?', walkup: [1] }],
  terminalAfterAlert: true,
  terminal: { cmd: 'grep -r human2 /mnt/moveit01/iis', expect: 'human2.aspx' },
  afterAlert: [{ label: 'partner asks: were our files taken?', phone: [2, 1] }],
  search: ['human2.aspx', 'Health Check Service'],
  verdict: 'moveit0day',
  actions: ['isolate', 'hunt', 'patch', 'rotate', 'scope', 'minimize'],
};
