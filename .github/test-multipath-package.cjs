// Verify extracted APK and IPK payloads against their source tree.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const [source, apk, ipk] = process.argv.slice(2);
let files = 0;
function compare(tree, prefix) {
  for (const entry of fs.readdirSync(tree, { withFileTypes: true })) {
    assert.ok(!entry.name.startsWith('._'), 'AppleDouble artifact');
    const current = path.join(tree, entry.name);
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) compare(current, relative);
    else {
      for (const root of [apk, ipk]) {
        const target = path.join(root, relative);
        if (entry.isSymbolicLink()) assert.equal(fs.readlinkSync(target), fs.readlinkSync(current));
        else {
          assert.deepEqual(fs.readFileSync(target), fs.readFileSync(current), relative);
          assert.equal(fs.statSync(target).mode & 0o777, fs.statSync(current).mode & 0o777, relative + ' mode');
        }
      }
      files++;
    }
  }
}
compare(path.join(source, 'root'), '');
compare(path.join(source, 'htdocs'), 'www');
const translation = 'usr/lib/lua/luci/i18n/homeproxy.zh-cn.lmo';
assert.ok(fs.statSync(path.join(apk, translation)).size > 1000);
assert.deepEqual(fs.readFileSync(path.join(apk, translation)), fs.readFileSync(path.join(ipk, translation)));
assert.match(fs.readFileSync(path.join(apk, 'lib/apk/packages/luci-app-homeproxy.conffiles'), 'utf8'), /\/etc\/config\/homeproxy/);
console.log('PASS: ' + files + ' source files match both APK/IPK bytes and modes; translations identical, UCI config protected');
