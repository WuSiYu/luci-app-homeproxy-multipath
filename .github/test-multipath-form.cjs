// Captures real LuCI form definitions; no browser/UI submission is simulated.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = process.argv[2] || path.join(__dirname, '../htdocs/luci-static/resources/view/homeproxy/node.js');
const fields = new Map();
const sandbox = {
  _: text => text,
  L: { bind: () => () => {} },
  form: new Proxy({}, { get: (_, key) => key }),
  hp: { shadowsocks_encrypt_methods: [], tls_versions: [], tls_cipher_suites: [] },
  widgets: {}, uci: {}, view: {},
};
vm.createContext(sandbox);
vm.runInContext(`String.prototype.format = function(...args) { let i = 0; return this.replace(/%s/g, () => args[i++]); };`, sandbox);
const render = vm.runInContext(`(function(){ ${fs.readFileSync(source, 'utf8').replace('return view.extend({', 'return renderNodeSettings; return view.extend({')} })()`, sandbox);
render({ option(kind, key, title, description) {
  const field = { kind, key, title, description, enabled: '1', disabled: '0', dependencies: [],
    value() {}, depends(...args) { this.dependencies.push(args); } };
  fields.set(key, field);
  return field;
} }, ['homeproxy'], { with_quic: true }, null, 'custom');
assert.ok(![...fields.keys()].some(key => key.startsWith('multipath_bandwidth')));
assert.match(fields.get('_multipath_scheduler').description, /protocol v8/);
assert.match(fields.get('multipath_aggregation_enabled').description, /condition 1 OR condition 2 OR condition 3/);
for (const key of ['activation_on_queue', 'activation_threshold_mbps', 'activation_after_bytes', 'activation_after_bytes_min_mbps', 'activation_window']) {
  const field = fields.get('multipath_' + key);
  assert.equal(field.retain, true, key);
  assert.equal(field.dependencies[0][0].multipath_aggregation_enabled, '1', key);
}
const rate = fields.get('multipath_activation_after_bytes_min_mbps').dependencies[0][0].multipath_activation_after_bytes;
for (const value of ['1', '2MB', ' 002 MiB ']) assert.ok(rate.test(value));
for (const value of ['0', '0MB', '', 'abc']) assert.ok(!rate.test(value));
assert.equal(fields.get('multipath_max_reorder_frames').datatype, 'or(0,and(uinteger,range(64,65536)))');
for (const key of ['multipath_activation_after_bytes', 'multipath_memory_limit']) {
  const validate = fields.get(key).validate;
  for (const value of ['0', '2MB', '256 MiB', '2097152', '']) assert.equal(validate('test', value), true);
}
console.log('PASS: no weight fields, directional OR controls/hidden-value retention, byte gate, optional integer chunk cap');
