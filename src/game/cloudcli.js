// `aws` and `az` for the in-game Terminal. A case describes WHAT the cloud contains (a table of subcommands that return
// plain objects) and this module does the rest like the real tools: global flags (--query, --output json|text|table|tsv,
// --region, --profile, --no-cli-pager), JSON indentation (AWS CLI v2 uses 4 spaces, Azure CLI 2), real-looking errors and usage text.
//
//   const aws = makeAwsCli({
//     'sts get-caller-identity': () => ({ UserId: 'AIDA...', Account: '111122223333', Arn: 'arn:aws:iam::111122223333:user/ci-deploy' }),
//     'iam list-users': () => ({ Users: [...] }),
//     'ec2 describe-instances': (a) => a.region === 'us-east-1' ? {...} : { Reservations: [] },   // a = parsed flags
//     'iam get-role-policy': (a) => deny('iam:GetRolePolicy', a),                                 // AccessDenied
//   }, { account: '111122223333', identity: 'arn:aws:iam::111122223333:user/ci-deploy' });
//   terminal.commands = { aws };
//
// A handler gets the parsed flags as camelCased keys without dashes (--role-name -> roleName) and returns an object
// (printed as JSON/text/table), a string (printed as-is), or throws cliError(message) for an error exit.

export class CliError extends Error {}
export const cliError = (m) => new CliError(m);

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function parseArgs(args) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = camel(eq > 0 ? a.slice(2, eq) : a.slice(2));
      if (eq > 0) flags[name] = a.slice(eq + 1);
      else if (i + 1 < args.length && !args[i + 1].startsWith('--') && !['noCliPager', 'noPaginate', 'debug', 'verbose', 'onlyShowErrors'].includes(name)) flags[name] = args[++i];
      else flags[name] = true;
    } else if (a === '-o') flags.output = args[++i];
    else if (a === '-n' || a === '-g') flags[a === '-n' ? 'name' : 'resourceGroup'] = args[++i];
    else pos.push(a);
  }
  return { pos, flags };
}

// ---------------------------------------------------------------------------------------------- --query (a JMESPath subset)
// Supported: a.b.c   a[]   a[0]   [?field=='value']   a[].b   a[?x==`1`].y   and top-level lists.
function jmes(expr, data) {
  const src = expr.trim();
  let cur = data;
  let i = 0;
  const readName = () => {
    const m = src.slice(i).match(/^[A-Za-z_][\w-]*|^"([^"]+)"/);
    if (!m) return null;
    i += m[0].length;
    return m[1] ?? m[0];
  };
  const project = (arr, rest) => (Array.isArray(arr) ? arr.map((x) => apply(x, rest)).filter((x) => x !== null && x !== undefined) : null);
  const apply = (value, rest) => {
    const saveI = i;
    const savedSrc = rest;
    let v = value;
    let k = 0;
    while (k < rest.length) {
      const c = rest[k];
      if (c === '.') { k++; continue; }
      if (c === '[') {
        const close = rest.indexOf(']', k);
        const inner = rest.slice(k + 1, close);
        const tail = rest.slice(close + 1);
        if (inner === '') {
          if (!Array.isArray(v)) return null;
          const flat = v.flat();
          return tail ? project(flat, tail.replace(/^\./, '')) : flat;
        }
        if (inner.startsWith('?')) {
          if (!Array.isArray(v)) return null;
          const m = inner.slice(1).match(/^\s*([\w.]+)\s*(==|!=|>=|<=|>|<)\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")\s*$/);
          if (!m) throw cliError(`Bad jmespath expression: ${inner}`);
          const [, field, op, a, b2, c2] = m;
          const want = a ?? b2 ?? c2;
          const filtered = v.filter((x) => {
            const got = field.split('.').reduce((o, p) => (o == null ? o : o[p]), x);
            const gs = String(got);
            const num = !Number.isNaN(Number(gs)) && !Number.isNaN(Number(want));
            const l = num ? Number(gs) : gs;
            const r = num ? Number(want) : want;
            return op === '==' ? l === r : op === '!=' ? l !== r : op === '>' ? l > r : op === '<' ? l < r : op === '>=' ? l >= r : l <= r;
          });
          return tail ? project(filtered, tail.replace(/^\./, '')) : filtered;
        }
        if (/^-?\d+$/.test(inner)) {
          const n = Number(inner);
          v = Array.isArray(v) ? v[n < 0 ? v.length + n : n] : null;
          k = close + 1;
          continue;
        }
        throw cliError(`Bad jmespath expression: ${inner}`);
      }
      const m = rest.slice(k).match(/^[A-Za-z_][\w-]*|^"([^"]+)"/);
      if (!m) throw cliError(`Bad jmespath expression: ${rest}`);
      const name = m[1] ?? m[0];
      k += m[0].length;
      v = v == null ? null : Array.isArray(v) ? v.map((x) => (x == null ? null : x[name])) : v[name];
    }
    i = saveI;
    void savedSrc;
    return v;
  };
  void readName;
  return apply(cur, src);
}

// ---------------------------------------------------------------------------------------------- output formats
const indentJson = (v, n) => JSON.stringify(v, null, n);

function textFormat(v) {
  // AWS CLI --output text: one line per top-level list item, tab separated; dicts become key-ordered values
  const flat = (x) => (x === null || x === undefined ? 'None' : typeof x === 'object' ? Object.values(x).map(flat).join('\t') : String(x));
  if (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')) return `${v.map(flat).join('\t')}\n`; // a list of scalars is ONE tab-separated line
  if (Array.isArray(v)) return `${v.map((x) => (Array.isArray(x) ? x.map(flat).join('\t') : flat(x))).join('\n')}\n`;
  if (v && typeof v === 'object') {
    const lines = [];
    for (const [k, val] of Object.entries(v)) {
      if (Array.isArray(val) && val.length && typeof val[0] === 'object') for (const item of val) lines.push(`${k.toUpperCase()}\t${flat(item)}`);
      else lines.push(`${k.toUpperCase()}\t${flat(val)}`);
    }
    return `${lines.join('\n')}\n`;
  }
  return `${flat(v)}\n`;
}

function tableFormat(v, title = '') {
  // A simple +---+ table of the first list found (AWS CLI v2 / Azure CLI -o table)
  let rows = Array.isArray(v) ? v : Object.values(v || {}).find(Array.isArray) || [v];
  rows = rows.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? r : { Value: r }));
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => rows.some((r) => r[c] !== null && typeof r[c] !== 'object'));
  const cell = (x) => (x === null || x === undefined ? '' : String(x));
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const sep = `+${w.map((n) => '-'.repeat(n + 2)).join('+')}+`;
  const line = (a) => `|${a.map((x, i) => ` ${x.padEnd(w[i])} `).join('|')}|`;
  const out = [];
  if (title) { out.push('-'.repeat(sep.length)); out.push(`|${title.padStart(Math.floor((sep.length - 2 + title.length) / 2)).padEnd(sep.length - 2)}|`); }
  out.push(sep, line(cols), sep, ...rows.map((r) => line(cols.map((c) => cell(r[c])))), sep);
  return `${out.join('\n')}\n`;
}

const tsvFormat = (v) => {
  const rows = Array.isArray(v) ? v : [v];
  return `${rows.map((r) => (r && typeof r === 'object' ? Object.values(r).map((x) => (x === null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x))).join('\t') : String(r))).join('\n')}\n`;
};

// ---------------------------------------------------------------------------------------------- the CLIs
const AWS_SERVICES = ['sts', 'iam', 's3', 's3api', 'ec2', 'cloudtrail', 'guardduty', 'secretsmanager', 'ssm', 'kms', 'lambda', 'rds', 'organizations', 'logs', 'cloudwatch', 'configservice', 'sns', 'ecr', 'eks', 'dynamodb'];

/** deny('iam:ListUsers', flags, { ... }) -> throws the real AccessDenied text */
export function awsDenied(action, who) {
  const op = action.split(':')[1];
  return cliError(`An error occurred (AccessDenied) when calling the ${op} operation: User: ${who} is not authorized to perform: ${action} because no identity-based policy allows the ${action} action`);
}

/**
 * @param {Record<string, (flags:object, pos:string[]) => any>} table keys like 'sts get-caller-identity' or 's3 ls'
 * @param {{ account?: string, identity?: string, region?: string }} opts
 */
export function makeAwsCli(table, { identity = 'arn:aws:iam::111122223333:user/ci-deploy', region = 'us-east-1' } = {}) {
  return (args) => {
    const { pos, flags } = parseArgs(args);
    if (args.includes('--version') || pos[0] === 'version') return 'aws-cli/2.13.25 Python/3.11.5 Linux/5.15.0-91-generic exe/x86_64.ubuntu.22 prompt/off\n';
    const [service, command, ...rest] = pos;
    if (!service || service === 'help') {
      return 'usage: aws [options] <command> <subcommand> [<subcommand> ...] [parameters]\nTo see help text, you can run:\n\n  aws help\n  aws <command> help\n  aws <command> <subcommand> help\n\naws: error: the following arguments are required: command\n';
    }
    if (!AWS_SERVICES.includes(service)) {
      return `\nusage: aws [options] <command> <subcommand> [<subcommand> ...] [parameters]\nTo see help text, you can run:\n\n  aws help\n  aws <command> help\n  aws <command> <subcommand> help\n\naws: error: argument command: Invalid choice, valid choices are:\n\n${AWS_SERVICES.map((s) => `${s}`).join('\n')}\n\n`;
    }
    const key = `${service} ${command}${service === 's3' && command === 'ls' && rest.length === 0 ? '' : ''}`;
    const handler = table[key] || (service === 's3' && command === 'ls' && table['s3 ls']) || null;
    if (!handler) {
      return `\nusage: aws [options] <command> <subcommand> [<subcommand> ...] [parameters]\nTo see help text, you can run:\n\n  aws help\n  aws <command> help\n  aws <command> <subcommand> help\n\naws: error: argument operation: Invalid choice, valid choices are:\n\n${Object.keys(table).filter((k) => k.startsWith(`${service} `)).map((k) => k.split(' ')[1]).sort().join('\n')}\n\n`;
    }
    const f = { ...flags, region: flags.region || region };
    let res;
    try {
      res = handler(f, command === 'ls' ? rest : rest, identity);
    } catch (e) {
      if (e instanceof CliError) return `\n${e.message}\n`;
      throw e;
    }
    if (typeof res === 'string') return res.endsWith('\n') ? res : `${res}\n`;
    if (res === undefined || res === null) return '';
    let data = res;
    if (flags.query) {
      try { data = jmes(String(flags.query), res); } catch (e) { return `\n${e.message}\n`; }
    }
    const fmt = flags.output || 'json';
    if (fmt === 'text') return textFormat(data);
    if (fmt === 'table') return tableFormat(data, command ? `${command.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('')}` : '');
    return `${indentJson(data, 4)}\n`;
  };
}

/**
 * Azure CLI. table keys are group + subcommand like 'ad user list', 'ad app list', 'role assignment list', 'account show'.
 * Without a prior `az login` the tool prints the real "Please run 'az login'" error unless `loggedIn` is true.
 */
export function makeAzCli(table, { loggedIn = true, user = 'analyst01@halcyonmutual.com', tenant = '4f0d6c2e-3b7a-4e0b-9a1d-5c6d7e8f9a01' } = {}) {
  const GROUPS = [...new Set(Object.keys(table).map((k) => k.split(' ')[0]))];
  return (args) => {
    const { pos, flags } = parseArgs(args);
    if (pos[0] === 'version' || args.includes('--version')) return indentJson({ 'azure-cli': '2.53.0', 'azure-cli-core': '2.53.0', 'azure-cli-telemetry': '1.1.0', extensions: {} }, 2) + '\n';
    if (!pos.length) return '\nWelcome to Azure CLI!\n\nUse `az -h` to see available commands or go to https://aka.ms/cli.\n\n';
    if (pos[0] === 'login') return indentJson([{ cloudName: 'AzureCloud', id: '9c1b2d3e-4f50-4a61-8b72-93a4b5c6d7e8', isDefault: true, name: 'Halcyon Production', state: 'Enabled', tenantId: tenant, user: { name: user, type: 'user' } }], 2) + '\n';
    if (!loggedIn) return "ERROR: Please run 'az login' to setup account.\n";
    // find the longest matching key (1-3 words)
    let key = null;
    let used = 0;
    for (let n = Math.min(3, pos.length); n >= 1; n--) {
      const k = pos.slice(0, n).join(' ');
      if (table[k]) { key = k; used = n; break; }
    }
    if (!key) {
      if (GROUPS.includes(pos[0])) return `\nGroup\n    az ${pos[0]}\n\nSubgroups / Commands:\n${Object.keys(table).filter((k) => k.startsWith(`${pos[0]} `)).map((k) => `    ${k.slice(pos[0].length + 1)}`).join('\n')}\n\n`;
      return `az: '${pos[0]}' is not in the 'az' command group. See 'az --help'. If the command is from an extension, please make sure the corresponding extension is installed. To learn more about extensions, please visit 'https://learn.microsoft.com/en-us/cli/azure/azure-cli-extensions-overview'.\n`;
    }
    let res;
    try {
      res = table[key](flags, pos.slice(used));
    } catch (e) {
      if (e instanceof CliError) return `${e.message}\n`;
      throw e;
    }
    if (typeof res === 'string') return res.endsWith('\n') ? res : `${res}\n`;
    let data = res;
    if (flags.query) {
      try { data = jmes(String(flags.query), res); } catch (e) { return `${e.message}\n`; }
    }
    const fmt = flags.output || 'json';
    if (fmt === 'tsv') return tsvFormat(data);
    if (fmt === 'table' || fmt === 'tab') return tableFormat(data).replace(/^-+\n/, '').replace(/^\+[-+]+\+\n/, '').replace(/^\|(.*)\|\n\+[-+]+\+\n/, (m, a) => `${a.trim().replace(/\s*\|\s*/g, '  ')}\n${'-'.repeat(a.trim().length)}\n`).replace(/^\|(.*)\|$/gm, (m, a) => a.trim().replace(/\s*\|\s*/g, '  ')).replace(/^\+[-+]+\+\n?/gm, '');
    return `${indentJson(data, 2)}\n`;
  };
}

export const _internal = { parseArgs, jmes, tableFormat, textFormat };
