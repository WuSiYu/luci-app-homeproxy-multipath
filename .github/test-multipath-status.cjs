// Renderer smoke test with LuCI DOM/poll mocks; not a browser or rpcd test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = process.argv[2] || path.join(__dirname, '../htdocs/luci-static/resources/view/homeproxy/multipath.js');
const storage = new Map();
const sandbox = {
  rpc: { declare: () => () => Promise.resolve({ nodes: [] }) },
  view: { extend: value => value },
  poll: { add: (_, interval) => assert.equal(interval, 1) },
  dom: { content: (node, children) => { node.children = children; } },
  _: value => value,
  E: (tag, attrs, children) => ({ tag, attrs: Array.isArray(attrs) ? {} : attrs || {}, children: children || (Array.isArray(attrs) ? attrs : []) }),
  window: { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } }
};
vm.createContext(sandbox);
vm.runInContext(`String.prototype.format = function(...values) {
  let index = 0;
  return this.replace(/%(0?)(\\d*)([sd])/g, (_, zero, width, type) => {
    const value = values[index++];
    return String(type === 'd' ? Math.trunc(value) : value).padStart(Number(width), zero ? '0' : ' ');
  });
};`, sandbox);
const page = vm.runInContext(`(function() { ${fs.readFileSync(source, 'utf8')} })()`, sandbox);
function flatten(node) {
  if (node == null) return '';
  if (Array.isArray(node)) return node.map(flatten).join('');
  if (typeof node !== 'object') return String(node);
  return flatten(node.children);
}
function findNodes(node, predicate) {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => findNodes(child, predicate));
  return [...(predicate(node) ? [node] : []), ...findNodes(node.children, predicate)];
}
function rows(label) {
  return findNodes(page.root, node => node.tag === 'dl').flatMap(dl => {
    const output = [];
    for (let i = 0; i < dl.children.length; i += 2)
      if (flatten(dl.children[i]) === label) output.push(flatten(dl.children[i + 1]));
    return output;
  });
}
function render(doc = document, extra = {}) {
  page.render({ nodes: [doc], ...extra });
  assert.ok(!JSON.stringify(page.root).includes('NaN'));
}
let document = {
  schema_version: 3, generated_at: new Date().toISOString(), process_started_at: new Date().toISOString(),
  node: { tag: 'mp-out', parameters: { max_reorder_frames: 0 }, logical: {}, legs: [{ id: 0, tag: 'primary' }, { id: 1, tag: 'booster' }] }
};
if (process.argv[3]) {
  const sample = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(line => line.startsWith('STATUS ')).at(-1);
  assert.ok(sample, 'No live status sample');
  document = JSON.parse(sample.slice(7));
}
render();
const rendered = JSON.stringify(page.root);
for (const text of ['Connection send history', 'Path in-flight data', 'Reinjection', '16 KiB pages', 'Remote scheduler estimate', 'Upload preferred only', 'Download on leg1', 'Feedback RTT', 'Probe RTT (active flows)', 'Probe health (active flows)']) assert.ok(rendered.includes(text), text);
assert.ok(!rendered.includes('Automatic delivery-based scheduling'));
assert.ok(!rendered.includes('Local TX policy'));
assert.ok(!rendered.includes('Queue utilization:'));
assert.ok(!rendered.includes('Sender replay'));
assert.ok(!rendered.includes('NaN'));
assert.ok(findNodes(page.root, node => node.tag === 'details').length >= 8);
assert.ok(findNodes(page.root, node => node.attrs?.class === 'mp-params-segment').length > 10);
assert.ok(findNodes(page.root, node => node.tag === 'dt').every(node => node.attrs.title));

document.generated_at = new Date().toISOString();
document.node.logical.remote_sender = { available: false };
render();
for (const label of ['Reinjection', 'Memory pressure', 'Connection send history', 'Writer state', 'Path in-flight data'])
  assert.ok(rows(label).every(value => /(?:Download|Remote) Unavailable/.test(value)), label);
assert.ok(rows('Remote scheduler estimate').every(value => value === 'Unavailable'));

document.node.logical.remote_sender = { available: true, stale: true, updated_at: new Date().toISOString() };
render();
for (const label of ['Reinjection', 'Memory pressure', 'Connection send history', 'Remote scheduler estimate'])
  assert.ok(rows(label).every(value => value.includes('(stale)')), label);
document.node.logical.remote_sender.stale = false;
document.node.legs.forEach(leg => { leg.remote_delivery_bytes_per_second = 0; });
render();
assert.ok(rows('Remote scheduler estimate').every(value => value === 'No delivery sample'));
delete document.node.logical.remote_sender.updated_at;
document.node.legs.forEach(leg => { leg.remote_failure_count = 7; });
render();
assert.deepEqual(rows('Remote sender status'), ['Historical totals only']);
assert.ok(rows('Leg lifecycle').every(value => value.includes('remote failures 7')));
assert.ok(rows('Memory pressure')[0].includes('Remote Unavailable'));
assert.ok(rows('Path in-flight data').every(value => value.includes('Download Unavailable')));
document.node.logical.remote_sender.updated_at = new Date().toISOString();
document.generated_at = '2000-01-01T00:00:00Z';
render();
assert.ok(rows('Memory pressure')[0].includes('(stale)'));
document.generated_at = new Date().toISOString();

const leg = document.node.legs[1];
Object.assign(leg, { last_error: 'test failure', last_error_harmless: false, last_error_at: new Date().toISOString(), error_count: 1 });
render();
const button = findNodes(page.root, node => node.attrs?.class === 'mp-event-close').at(-1);
assert.ok(button);
button.attrs.click({ currentTarget: { closest: () => ({ remove() {} }) } });
render();
assert.ok(!flatten(page.root).includes('test failure'));
leg.error_count++;
render();
assert.ok(flatten(page.root).includes('test failure'));
leg.last_error_harmless = true;
render();
assert.ok(!flatten(page.root).includes('test failure'));

const section = findNodes(page.root, node => node.tag === 'details')[0];
section.attrs.toggle({ currentTarget: { open: false } });
render();
assert.equal(findNodes(page.root, node => node.tag === 'details')[0].attrs.open, null);
render({ ...document, schema_version: 2 }, { incompatible_schemas: [2] });
assert.ok(JSON.stringify(page.root).includes('No multipath status data is available.'));
assert.ok(flatten(page.root).includes('Unsupported status schema: 2'));
console.log('PASS: schema 3 counters/tooltips, unavailable/stale/historical states, folding, event dismissal, segment wrapping, 1s poll, old-schema notice');
