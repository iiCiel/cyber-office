// Burp Proxy history for the Meridian engagement: what Firefox sent through Burp while the tester clicked around
// the in-scope web apps. respond() answers Repeater requests; a quote in the login form breaks the SQL (finding).
const DATE = 'Fri, 06 Nov 2026 13:12:41 GMT';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const req = (method, host, path, extra = [], body = '') => [
  `${method} ${path} HTTP/1.1`, `Host: ${host}`, `User-Agent: ${UA}`,
  'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language: en-US,en;q=0.5', 'Accept-Encoding: gzip, deflate, br',
  ...extra, 'Connection: keep-alive', '', body].join('\n').replace(/\n$/, '');
// Server banners match the nmap -sV output in cptcRaw1.js: www runs Apache 2.4.41, the portal runs nginx 1.18.0
// and its PHPSESSID cookie has no HttpOnly flag (nmap http-cookie-flags).
const res = (status, head, body, server = 'nginx/1.18.0 (Ubuntu)') => [`HTTP/1.1 ${status}`, `Date: ${DATE}`, `Server: ${server}`, ...head, '', body].join('\n');
const APACHE = 'Apache/2.4.41 (Ubuntu)';

const LOGIN_PAGE = [
  '<!DOCTYPE html>', '<html lang="en">', '<head>', '  <meta charset="utf-8">', '  <title>MyMeridian Patient Portal - Sign in</title>',
  '  <link rel="stylesheet" href="/static/portal.css">', '</head>', '<body>', '  <form method="post" action="/login">',
  '    <label>Username <input name="user"></label>', '    <label>Password <input name="pass" type="password"></label>',
  '    <button>Sign in</button>', '  </form>', '</body>', '</html>'].join('\n');
const BAD_LOGIN = '<!DOCTYPE html>\n<html lang="en">\n<head><title>MyMeridian Patient Portal - Sign in</title></head>\n<body>\n  <p class="err">Invalid username or password.</p>\n</body>\n</html>';
const COOKIE = 'Cookie: PHPSESSID=7rk2c1v0h5qfm3d8ab61u4e9np';

export const MERIDIAN_BURP = {
  history: [
    { host: 'https://www.meridian.example', method: 'GET', url: '/', status: 200, mime: 'HTML', title: 'Meridian Health Partners | Care close to home', ip: '198.51.100.30',
      req: req('GET', 'www.meridian.example', '/'),
      res: res('200 OK', ['Content-Type: text/html; charset=UTF-8'], '<!DOCTYPE html>\n<html lang="en">\n<head><title>Meridian Health Partners | Care close to home</title></head>\n<body>\n  <a href="https://portal.meridian.example/">Patient portal</a>\n</body>\n</html>', APACHE) },
    { host: 'https://www.meridian.example', method: 'GET', url: '/robots.txt', status: 200, mime: 'text', ext: 'txt', ip: '198.51.100.30',
      req: req('GET', 'www.meridian.example', '/robots.txt'),
      res: res('200 OK', ['Content-Type: text/plain'], 'User-agent: *\nDisallow: /wp-admin/\nDisallow: /staff/', APACHE) },
    { host: 'https://portal.meridian.example', method: 'GET', url: '/', status: 302, mime: 'HTML', ip: '198.51.100.25',
      req: req('GET', 'portal.meridian.example', '/', ['Referer: https://www.meridian.example/']),
      res: res('302 Found', ['Location: /login', 'Set-Cookie: PHPSESSID=7rk2c1v0h5qfm3d8ab61u4e9np; path=/; secure', 'X-Powered-By: PHP/7.4.3', 'Content-Length: 0'], '') },
    { host: 'https://portal.meridian.example', method: 'GET', url: '/login', status: 200, mime: 'HTML', title: 'MyMeridian Patient Portal - Sign in', ip: '198.51.100.25',
      req: req('GET', 'portal.meridian.example', '/login', [COOKIE]),
      res: res('200 OK', ['Content-Type: text/html; charset=UTF-8', 'X-Powered-By: PHP/7.4.3'], LOGIN_PAGE) },
    { host: 'https://portal.meridian.example', method: 'POST', url: '/login', params: true, status: 200, mime: 'HTML', title: 'MyMeridian Patient Portal - Sign in', ip: '198.51.100.25',
      req: req('POST', 'portal.meridian.example', '/login', ['Content-Type: application/x-www-form-urlencoded', 'Content-Length: 25', 'Origin: https://portal.meridian.example', 'Referer: https://portal.meridian.example/login', COOKIE], 'user=jdoe&pass=Summer2026'),
      res: res('200 OK', ['Content-Type: text/html; charset=UTF-8', 'X-Powered-By: PHP/7.4.3'], BAD_LOGIN) },
  ],
  // Open browser (Proxy > Intercept): Firefox signs in to the portal again. With Intercept on, this POST stops in Burp.
  intercept: [
    { host: 'https://portal.meridian.example', method: 'POST', url: '/login',
      req: req('POST', 'portal.meridian.example', '/login', ['Content-Type: application/x-www-form-urlencoded', 'Content-Length: 25', 'Origin: https://portal.meridian.example', 'Referer: https://portal.meridian.example/login', COOKIE], 'user=jdoe&pass=Summer2026') },
  ],
  /** Answer a Repeater request. hit = what the scene's engagement logic said ({ discovered }). */
  respond(reqText, hit) {
    const [first = ''] = reqText.split('\n');
    const body = reqText.includes('\n\n') ? reqText.slice(reqText.indexOf('\n\n') + 2) : '';
    const user = decodeURIComponent(((body.match(/(?:^|&)user=([^&]*)/) || [])[1] || '').replace(/\+/g, ' '));
    if (/^POST \/login/.test(first) && (hit?.discovered === 'sql-injection' || /'/.test(user))) {
      return res('500 Internal Server Error', ['Content-Type: text/html; charset=UTF-8', 'X-Powered-By: PHP/7.4.3'],
        `<b>Fatal error</b>: Uncaught mysqli_sql_exception: You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${user.slice(user.indexOf("'") + 1)}' AND pass='...' at line 1 in /var/www/portal/login.php:31`);
    }
    if (/^POST \/login/.test(first)) return res('200 OK', ['Content-Type: text/html; charset=UTF-8', 'X-Powered-By: PHP/7.4.3'], BAD_LOGIN);
    const path = first.split(' ')[1] || '/';
    const known = MERIDIAN_BURP.history.find((r) => r.url === path && r.method === first.split(' ')[0]);
    return known ? known.res : res('404 Not Found', ['Content-Type: text/html'], '<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center></body></html>');
  },
};
