export default {
  id: 'target-2013',
  report: ['recert'],
  steps: [{ label: 'monitoring desk FireEye call', phone: [1] }],
  terminalAfterAlert: true,
  terminal: { cmd: 'grep -i poswds /mnt/exports/pos/services.csv', expect: 'svchosts.exe' },
  afterAlert: [{ label: 'Cyber Monday change freeze', walkup: [1] }],
  search: ['new_ip=true fazio-hvac', 'ftp.exe cmd.txt'],
  verdict: 'vendor',
  actions: ['block-ftp', 'isolate-stage', 'disable-vendor', 'pos-sweep', 'segment', 'alerts', 'ir'],
};
