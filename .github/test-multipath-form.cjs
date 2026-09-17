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
assert.ok(!fields.has('_multipath_scheduler'));

assert.equal(fields.get('multipath_failover_enabled').default, '0');
assert.equal(fields.get('multipath_failover_timeout').default, '5');
assert.equal(fields.get('multipath_failback_delay').default, '30');
for (const direction of ['upload', 'download']) {
  const prefix = 'multipath_' + direction + '_';
  assert.match(fields.get(prefix + 'aggregation_enabled').description, /condition 1 OR condition 2 OR condition 3/);
  assert.equal(fields.get(prefix + 'aggregation_enabled').default, '1');
  assert.equal(fields.get(prefix + 'leg0_traffic_saving').default, '0');
  for (const key of ['leg0_traffic_saving', 'activation_on_queue', 'activation_threshold_mbps', 'activation_after_bytes', 'activation_after_bytes_min_mbps', 'activation_window']) {
    const field = fields.get(prefix + key);
    assert.equal(field.retain, true, key);
    assert.equal(field.dependencies.length, 1, key);
    assert.equal(field.dependencies[0][0][prefix + 'aggregation_enabled'], '1', key);
  }
  const rate = fields.get(prefix + 'activation_after_bytes_min_mbps').dependencies[0][0][prefix + 'activation_after_bytes'];
  for (const value of ['1', '2MB', ' 002 MiB ']) assert.ok(rate.test(value));
  for (const value of ['0', '0MB', '', 'abc']) assert.ok(!rate.test(value));
  for (const key of ['activation_after_bytes', 'send_buffer_bytes', 'receive_window_bytes']) {
    const validate = fields.get(prefix + key).validate;
    for (const value of ['0', '2MB', '256 MiB', '2097152', '']) assert.equal(validate('test', value), true);
  }
}
for (const key of ['multipath_frame_size', 'multipath_memory_limit'])
  for (const value of ['0', '2MB', '256 MiB', '2097152', '']) assert.equal(fields.get(key).validate('test', value), true);
for (const key of ['aggregation_enabled', 'max_reorder_frames', 'receive_window_frames', 'chunk_size', 'leg1_replay_bytes'])
  assert.ok(!fields.has('multipath_' + key));
assert.match(fields.get('_multipath_beta8_migration').default, /ignored, not migrated/);
console.log('PASS: beta8 directional OR controls, hidden-value retention, byte sizes, saving defaults, removed legacy controls');
