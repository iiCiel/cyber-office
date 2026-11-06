import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPTC_LAB } from '../src/data/cptcLabScenario.js';
import { CPTC_LAB_2 } from '../src/data/cptcLabScenario2.js';
import { CPTC_LAB_3 } from '../src/data/cptcLabScenario3.js';
import { newReport, runEnum } from '../src/game/cptclab.js';

// Each case: a typed command and ONE marker that only the real tool's output format contains.
const CASES = {
  meridian: [CPTC_LAB, [
    ['nmap -sV 198.51.100.0/24', /^PORT\s+STATE SERVICE\s+VERSION$/, null],
    ['nmap -sV 198.51.100.0/24', /^Nmap done: \d+ IP addresses \(\d+ hosts? up\) scanned in [\d.]+ seconds$/, null],
    ['xfreerdp /v:198.51.100.20', /\[ERROR\]\[com\.freerdp|\[INFO\]\[com\.freerdp/, 'ext-rdp'],
    ['sqlmap -u https://portal.meridian.example/login --data=user=admin', /sqlmap identified the following injection point/, 'sql-injection'],
    ['smbclient -L //10.20.0.15 -N', /^\s*Sharename\s+Type\s+Comment$/, 'smb-share'],
    ['snmpwalk -v2c -c public 10.20.0.40', /^iso\.3\.6\.1\.2\.1\.1\.1\.0 = STRING:/, 'default-snmp'],
    ['sslscan www.meridian.example', /SSL\/TLS Protocols:/, 'weak-tls'],
  ]],
  atlas: [CPTC_LAB_2, [
    ['nmap -sV 203.0.113.0/24', /^Nmap done: 256 IP addresses/, null],
    ['dig statements.atlas-cu.example', /^;; ANSWER SECTION:$/, null],
    ['aws s3 ls s3://atlas-statements-prod --no-sign-request', /^\s+PRE 2026\/$/, 'open-bucket'],
    ['curl -s https://api.atlas-cu.example/v2/accounts/10044/statements', /^\{"account_id":10044,/, 'api-idor'],
    ['nuclei -u https://vpn.atlas-cu.example', /^\[citrix-adc-version\] \[http\] \[info\]/, 'vpn-cve'],
    ['curl -u admin:admin https://ops.atlas-cu.example/api/org', /"isGrafanaAdmin":true/, 'default-creds'],
    ['gobuster dir -u http://dev.atlas-cu.example -w common.txt', /^\/\.env\s+\(Status: 200\)/, 'exposed-env'],
    ['curl -s https://assets.atlas-cu.example/files/', /<title>Index of \/files\/<\/title>/, 'dir-listing'],
  ]],
  lakeshore: [CPTC_LAB_3, [
    ['nmap -sV -p- 203.0.113.0/24', /^\|_http-title: Dashboard \[Jenkins\]$/, null],
    ['nmap -sV 10.30.0.0/16', /^88\/tcp\s+open\s+kerberos-sec/, null],
    ['curl -s http://ci.lakeshore-freight.example:8080/script', /<title>Script Console \[Jenkins\]<\/title>/, 'jenkins-script-console'],
    ['snmpwalk -v2c -c public 203.0.113.70', /^SNMPv2-MIB::sysName\.0 = STRING:/, 'snmp-public'],
    ['curl -s "https://track.lakeshore-freight.example/api/shipments/10492"', /^\{"shipment_id":10492,/, 'tracking-idor'],
    ['curl -u tomcat:s3cret http://ops.lakeshore-freight.example:8080/manager/text/list', /^OK - Listed applications for virtual host/, 'tomcat-default-creds'],
    ['impacket-GetNPUsers LAKESHORE.example/ -usersfile users.txt -no-pass -dc-ip 10.30.0.10', /UF_DONT_REQUIRE_PREAUTH/, 'asrep-roast'],
    ["crackmapexec smb 10.30.0.25 -u svc-wms -p 'cracked-password'", /\(Pwn3d!\)$/, 'password-reuse-lateral'],
  ]],
};

for (const [name, [sc, cases]] of Object.entries(CASES)) {
  test(`${name}: every command prints raw tool output, not a summary`, () => {
    for (const [cmd, marker, findingId] of cases) {
      const s = newReport(sc);
      const r = runEnum(s, cmd);
      const texts = r.lines.map((l) => l.text);
      assert.ok(texts.some((t) => marker.test(t)), `${cmd}: missing raw marker ${marker}\n${texts.join('\n')}`);
      assert.ok(!texts.some((t) => /\s->\s/.test(t) && !/^(\[|SMB|<)/.test(t)), `${cmd}: still prints a "->" summary line`);
      if (findingId) assert.ok(s.discovered[findingId], `${cmd}: did not confirm ${findingId}`);
    }
  });

  test(`${name}: every finding has its own raw output`, () => {
    const ids = new Set(Object.keys(sc.raw.findings));
    for (const f of sc.findings) assert.ok(ids.has(f.id), `${f.id} has no raw output`);
  });
}

test('raw evidence keeps secrets and hashes redacted', () => {
  for (const sc of [CPTC_LAB, CPTC_LAB_2, CPTC_LAB_3]) {
    const all = JSON.stringify(sc.raw, (k, v) => (typeof v === 'function' ? String(v) : v));
    assert.ok(!/\$krb5asrep\$23\$[^:]+:[0-9a-f]{16}/i.test(all), 'unredacted AS-REP hash');
    assert.ok(!/(PASSWORD|SECRET)=(?!\[REDACTED\])\S/.test(all), 'unmasked secret in .env output');
  }
});
