// Browser-test plan for the Capital One 2019 case (same shape as PLANS in scripts/smoke-case.mjs).
export default {
  id: 'capital-one-2019',
  report: ['aws-suspend'],
  steps: [
    { label: 'disclosure tip', walkup: [1, 1] },
    { tickets: { 'waf-role': 'scope', metadata: 'layered', logging: 'rule' } },
  ],
  search: ['ListBuckets 203.0.113.17', 'security-credentials', 'ListAllMyBuckets', 'metadata service'],
  verdict: 'ssrf-role',
  actions: ['revoke', 'scope', 'proxy', 'alert', 'ir', 'tokenize', 'disclosure'],
};
