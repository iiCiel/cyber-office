export default {
  id: 'equifax-2017',
  report: ['cert-phish'],
  steps: [{ label: 'ACIS owner', walkup: [1] }],
  terminalAfterAlert: true,
  terminal: { cmd: 'grep -ri -E "vulnerable|expired|password" /mnt/exports', expect: 'acis-app01' },
  afterAlert: [{ label: 'weekend escalation', walkup: [1] }],
  search: ['ognl', 'connections.properties'],
  verdict: 'struts',
  actions: ['offline', 'creds', 'shells', 'segment', 'certs', 'ir', 'patch'],
};
