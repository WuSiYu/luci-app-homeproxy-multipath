// Run only in a disposable OpenWrt container: overwrites its test UCI config.
import { readfile, writefile, mkdir, symlink, unlink } from 'fs';
import { cursor } from 'uci';

function check(condition, message) {
	if (!condition) die(message);
}

mkdir('/var/run');
mkdir('/var/run/homeproxy');
mkdir('/var/run/homeproxy/multipath-status');
const directory = '/var/run/homeproxy/multipath-status/';
writefile(directory + 'current.json', '{"schema_version":5,"node":{"tag":"test"}}');
writefile(directory + 'old.json', '{"schema_version":4,"node":{"tag":"old"}}');
writefile(directory + 'broken.json', '{broken');
writefile(directory + 'wrong.json', '{"schema_version":5,"node":false}');
writefile(directory + 'large.json', sprintf('%1100000s', 'x'));
symlink(directory + 'current.json', directory + 'link.json');
const methods = loadfile('/src/root/usr/share/rpcd/ucode/luci.homeproxy')()['luci.homeproxy'];
const result = methods.multipath_status.call();
check(length(result.nodes) === 1 && result.nodes[0].node.tag === 'test', 'RPC must accept only valid regular schema-5 files');
check(length(result.incompatible_schemas) === 1 && result.incompatible_schemas[0] === 4, 'RPC must report old schema');
for (let name in ['current', 'old', 'broken', 'wrong', 'large', 'link']) unlink(directory + name + '.json');
print('PASS: real ucode RPC: schema 5, old-schema diagnostic, malformed/oversized/symlink rejection\n');

/* Migration from beta9: early-write flag, default-valued ceiling, untouched example values. */
writefile('/etc/config/homeproxy', readfile('/src/root/etc/config/homeproxy'));
let migration = cursor();
migration.set('homeproxy', 'multipath_example', 'tcp_fast_open', '1');
migration.set('homeproxy', 'multipath_example', 'multipath_download_queue_frames', '256');
migration.set('homeproxy', 'multipath_example', 'multipath_download_activation_threshold_mbps', '120');
migration.set('homeproxy', 'multipath_example', 'multipath_download_activation_window', '1');
migration.set('homeproxy', 'mine', 'node');
migration.set('homeproxy', 'mine', 'type', 'multipath');
migration.set('homeproxy', 'mine', 'multipath_upload_queue_frames', '512');
migration.set('homeproxy', 'mine', 'multipath_upload_activation_threshold_mbps', '120');
migration.set('homeproxy', 'mine', 'multipath_upload_activation_window', '1');
migration.commit('homeproxy');
check(system('ucode -L /src/root/etc/homeproxy/scripts /src/root/etc/homeproxy/scripts/migrate_config.uc') === 0, 'Migration failed');
migration = cursor();
check(migration.get('homeproxy', 'multipath_example', 'multipath_tcp_fast_open') === '1' && migration.get('homeproxy', 'multipath_example', 'tcp_fast_open') == null, 'Early-write flag not moved');
for (let key in ['queue_frames', 'activation_threshold_mbps', 'activation_window'])
	check(migration.get('homeproxy', 'multipath_example', 'multipath_download_' + key) == null, 'Example default not cleared: ' + key);
check(migration.get('homeproxy', 'mine', 'multipath_upload_queue_frames') === '512', 'Custom ceiling must stay');
check(migration.get('homeproxy', 'mine', 'multipath_upload_activation_threshold_mbps') === '120' && migration.get('homeproxy', 'mine', 'multipath_upload_activation_window') === '1', 'User activation settings must stay');
print('PASS: beta10 migration keeps user settings and clears untouched example defaults\n');

writefile('/etc/config/homeproxy', readfile('/src/root/etc/config/homeproxy'));
const uci = cursor();
uci.set('homeproxy', 'config', 'main_node', 'multipath_example');
uci.set('homeproxy', 'config', 'routing_mode', 'global');
// No external connections are opened; only generate and validate JSON.
uci.set('homeproxy', 'multipath_example', 'multipath_bandwidth_leg0_mbps', '160');
uci.set('homeproxy', 'multipath_example', 'multipath_bandwidth_leg1_mbps', '750');

const legacy = ['aggregation_enabled', 'activation_on_queue', 'activation_threshold_mbps', 'activation_after_bytes', 'activation_after_bytes_min_mbps', 'activation_window', 'queue_frames', 'chunk_size', 'max_reorder_frames', 'max_reorder_bytes', 'leg1_replay_bytes', 'leg1_replay_timeout'];
for (let key in legacy) uci.set('homeproxy', 'multipath_example', 'multipath_' + key, 'invalid-ignored-value');
uci.set('homeproxy', 'multipath_example', 'multipath_upload_aggregation_enabled', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_download_aggregation_enabled', '1');
uci.set('homeproxy', 'multipath_example', 'multipath_download_leg0_traffic_saving', '1');
uci.set('homeproxy', 'multipath_example', 'multipath_download_activation_on_queue', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_download_activation_threshold_mbps', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_download_activation_after_bytes', '2MB');
uci.set('homeproxy', 'multipath_example', 'multipath_download_activation_after_bytes_min_mbps', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_download_send_buffer_bytes', '64MB');
uci.set('homeproxy', 'multipath_example', 'multipath_download_receive_window_bytes', '128 MB');
uci.set('homeproxy', 'multipath_example', 'multipath_download_path_stall_timeout_min', '2');
uci.set('homeproxy', 'multipath_example', 'multipath_upload_activation_window', '200ms');
uci.set('homeproxy', 'multipath_example', 'multipath_handshake_timeout', '15');
uci.set('homeproxy', 'multipath_example', 'multipath_frame_size', '64KB');
uci.set('homeproxy', 'multipath_example', 'multipath_memory_limit', '256MB');
uci.commit('homeproxy');

function generate() {
 check(system('ucode -L /src/root/etc/homeproxy/scripts /src/root/etc/homeproxy/scripts/generate_client.uc') === 0, 'Generator failed');
 let config = json(readfile('/var/run/homeproxy/sing-box-c.json'));
 let mp = filter(config.outbounds, node => node.type === 'multipath')[0];
 check(mp != null, 'Missing multipath outbound');
 for (let key in legacy) check(!(key in mp), 'Legacy must not be emitted: ' + key);
 check(!('bandwidth_mbps' in mp), 'Legacy weights must not be emitted');
 check(length(filter(config.outbounds, node => node.tag === mp.outbounds[0] || node.tag === mp.outbounds[1])) === 2, 'Missing child outbounds');
 return mp;
}

let mp = generate();
check(mp.upload.aggregation_enabled === false && mp.download.aggregation_enabled === true, 'Direction flags lost');
check(mp.download.leg0_traffic_saving === true && mp.download.activation_on_queue === false, 'Direction flags lost');
check(mp.download.activation_threshold_mbps === 0 && mp.download.activation_after_bytes_min_mbps === 0, 'Explicit zero lost');
check(mp.download.activation_after_bytes === '2MB' && mp.memory_limit === '256MB' && mp.frame_size === '64KB', 'Size strings lost');
check(mp.download.send_buffer_bytes === '64MB' && mp.download.receive_window_bytes === '128 MB', 'Window strings lost');
check(mp.download.path_stall_timeout_min === '2s', 'Stall floor not emitted as duration');
check(mp.upload.activation_window === '200ms' && mp.handshake_timeout === '15s', 'Duration strings lost');
check(mp.psk === 'change-me-to-a-long-random-string', 'Pre-shared key lost');
check(!('tcp_fast_open' in mp), 'Unset early write must use the sing-box default');
writefile('/tmp/homeproxy-beta10-zero.json', readfile('/var/run/homeproxy/sing-box-c.json'));

uci.set('homeproxy', 'multipath_example', 'multipath_download_activation_after_bytes', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_download_send_buffer_bytes', '67108864');
uci.set('homeproxy', 'multipath_example', 'multipath_download_receive_window_bytes', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_frame_size', '16384');
uci.set('homeproxy', 'multipath_example', 'multipath_memory_limit', '268435456');
uci.commit('homeproxy');
mp = generate();
check(mp.download.activation_after_bytes === 0 && mp.download.send_buffer_bytes === 67108864 && mp.download.receive_window_bytes === 0 && mp.memory_limit === 268435456 && mp.frame_size === 16384, 'Integer sizes lost');
writefile('/tmp/homeproxy-beta10-integer.json', readfile('/var/run/homeproxy/sing-box-c.json'));
uci.set('homeproxy', 'multipath_example', 'multipath_tcp_fast_open', '0');
uci.commit('homeproxy');
mp = generate();
check(mp.tcp_fast_open === false, 'Disabled early write lost');

for (let key in ['aggregation_enabled', 'leg0_traffic_saving', 'activation_on_queue', 'activation_threshold_mbps', 'activation_after_bytes', 'activation_after_bytes_min_mbps', 'send_buffer_bytes', 'receive_window_bytes', 'path_stall_timeout_min'])
 uci.delete('homeproxy', 'multipath_example', 'multipath_download_' + key);
uci.commit('homeproxy');
mp = generate();
for (let key in ['aggregation_enabled', 'leg0_traffic_saving', 'activation_on_queue', 'activation_threshold_mbps', 'activation_after_bytes', 'activation_after_bytes_min_mbps', 'send_buffer_bytes', 'receive_window_bytes', 'path_stall_timeout_min'])
 check(!(key in mp.download), 'Empty optional field must be omitted: ' + key);
print('PASS: full beta10 UCI generator: directional policies, durations, psk, early write, legacy ignored, child recursion, false/zero, memory formats and defaults\n');

uci.set('homeproxy', 'multipath_example', 'multipath_failover_enabled', '1');
uci.set('homeproxy', 'multipath_example', 'multipath_failover_timeout', '7');
uci.set('homeproxy', 'multipath_example', 'multipath_failback_delay', '45');
uci.set('homeproxy', 'multipath_example', 'multipath_udp_outbound', 'secondary');
uci.commit('homeproxy');
mp = generate();
check(mp.failover_enabled === true && mp.failover_timeout === '7s' && mp.failback_delay === '45s', 'Recovery timers must be emitted in seconds');
check(mp.udp_outbound === mp.outbounds[1], 'UDP preference must remain independent');
writefile('/tmp/homeproxy-beta10-recovery.json', readfile('/var/run/homeproxy/sing-box-c.json'));
uci.set('homeproxy', 'multipath_example', 'multipath_failover_enabled', '0');
uci.commit('homeproxy');
mp = generate();
check(mp.failover_enabled === false && !('failover_timeout' in mp) && !('failback_delay' in mp), 'Disabled recovery must omit hidden timers');
print('PASS: recovery flag, durations, independent UDP preference and disabled timer omission\n');

/* Server multipath inbound */
uci.set('homeproxy', 'server', 'enabled', '1');
uci.set('homeproxy', 'mp_in', 'server');
uci.set('homeproxy', 'mp_in', 'enabled', '1');
uci.set('homeproxy', 'mp_in', 'type', 'multipath');
uci.set('homeproxy', 'mp_in', 'port', '39000');
uci.set('homeproxy', 'mp_in', 'multipath_psk', 'secret');
uci.set('homeproxy', 'mp_in', 'multipath_allowed_ips', ['198.51.100.0/24', '2001:db8::/32']);
uci.set('homeproxy', 'mp_in', 'multipath_memory_limit', '256MB');
uci.set('homeproxy', 'mp_in', 'multipath_handshake_timeout', '10');
uci.commit('homeproxy');
check(system('ucode -L /src/root/etc/homeproxy/scripts /src/root/etc/homeproxy/scripts/generate_server.uc') === 0, 'Server generator failed');
let server = json(readfile('/var/run/homeproxy/sing-box-s.json'));
let inbound = filter(server.inbounds, node => node.type === 'multipath')[0];
check(inbound != null && inbound.listen_port === 39000 && inbound.psk === 'secret', 'Server multipath inbound missing');
check(length(inbound.allowed_ips) === 2 && inbound.memory_limit === '256MB' && inbound.handshake_timeout === '10s', 'Server multipath fields lost');
check(!('users' in inbound) && !('password' in inbound), 'Multipath inbound must not carry users');
writefile('/tmp/homeproxy-beta10-server.json', readfile('/var/run/homeproxy/sing-box-s.json'));
print('PASS: server multipath inbound with psk, allowed_ips, memory and handshake settings\n');
