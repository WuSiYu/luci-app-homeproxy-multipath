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
  for (const value of ['1', '2MB', ' 002 MB ']) assert.ok(rate.test(value));
  for (const value of ['0', '0MB', '', 'abc']) assert.ok(!rate.test(value));
  for (const key of ['activation_after_bytes', 'send_buffer_bytes', 'receive_window_bytes']) {
    const validate = fields.get(prefix + key).validate;
    for (const value of ['0', '2MB', '256 MB', '2097152', '']) assert.equal(validate('test', value), true);
    for (const value of ['2MiB', '256 MiB', '-1', '1.5MB']) assert.notEqual(validate('test', value), true);
  }
}
for (const key of ['multipath_frame_size', 'multipath_memory_limit'])
  for (const value of ['0', '2MB', '256 MB', '2097152', '']) assert.equal(fields.get(key).validate('test', value), true);
for (const key of ['aggregation_enabled', 'max_reorder_frames', 'receive_window_frames', 'chunk_size', 'leg1_replay_bytes'])
  assert.ok(!fields.has('multipath_' + key));
assert.match(fields.get('_multipath_beta10_migration').default, /beta10/);
assert.ok(!fields.has('_multipath_beta8_migration'));
assert.equal(fields.get('multipath_psk').password, true);
assert.equal(fields.get('multipath_tcp_fast_open').default, '1');
assert.equal(fields.get('multipath_tcp_fast_open').rmempty, false);
assert.equal(typeof fields.get('_multipath_leg_warning').cfgvalue, 'function');
const durations = {
  multipath_handshake_timeout: [['10s', '1', '60', '1000ms'], ['500ms', '61s', '2m', 'abc', '1.5s', '-1']],
  multipath_failover_timeout: [['5', '5s', '1s', '5m', '300s'], ['999ms', '301s', '6m']],
  multipath_failback_delay: [['30', '1s', '1h', '3600s'], ['0', '3601s', '2h']],
  multipath_upload_activation_window: [['200ms', '20ms', '1', '10s'], ['19ms', '11s', '0', '1m']],
  multipath_download_path_stall_timeout_min: [['0', '100ms', '2s', '5m'], ['99ms', '6m', '1h']]
};
for (const [key, [valid, invalid]] of Object.entries(durations)) {
  const field = fields.get(key);
  for (const value of [...valid, '']) assert.equal(field.validate.call(field, 'test', value), true, key + ' ' + value);
  for (const value of invalid) assert.notEqual(field.validate.call(field, 'test', value), true, key + ' ' + value);
}
for (const direction of ['upload', 'download']) {
  const prefix = 'multipath_' + direction + '_';
  assert.equal(fields.get(prefix + 'queue_frames').default, undefined);
  assert.equal(fields.get(prefix + 'activation_window').default, undefined);
}
// UDP may only use a leg whose node carries UDP; failover needs both legs.
const nodes = { direct: { type: 'direct' }, hy2: { type: 'hysteria2' }, http: { type: 'http' }, ssh: { type: 'ssh' },
  naive: { type: 'naive' }, naive_uot: { type: 'naive', udp_over_tcp: '1' } };
sandbox.uci.get = (config, section, option) => nodes[section]?.[option];
const form = (preferred, secondary) => ({ section: { formvalue: (_, key) => ({ multipath_preferred: preferred, multipath_secondary: secondary })[key] } });
const udpOutbound = fields.get('multipath_udp_outbound').validate, failover = fields.get('multipath_failover_enabled').validate;
assert.equal(udpOutbound.call(form('direct', 'http'), 'test', 'preferred'), true);
assert.notEqual(udpOutbound.call(form('direct', 'http'), 'test', 'secondary'), true);
assert.notEqual(udpOutbound.call(form('naive', 'hy2'), 'test', 'preferred'), true);
assert.equal(udpOutbound.call(form('naive_uot', 'hy2'), 'test', 'preferred'), true);
assert.equal(failover.call(form('direct', 'ssh'), 'test', '0'), true);
assert.notEqual(failover.call(form('direct', 'ssh'), 'test', '1'), true);
assert.equal(failover.call(form('direct', 'hy2'), 'test', '1'), true);
console.log('PASS: beta10 directional OR controls, durations, psk, early write, hidden-value retention, byte sizes, removed legacy controls, UDP-capable legs');
