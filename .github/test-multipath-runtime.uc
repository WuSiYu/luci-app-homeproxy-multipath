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
writefile(directory + 'current.json', '{"schema_version":4,"node":{"tag":"test"}}');
writefile(directory + 'old.json', '{"schema_version":2,"node":{"tag":"old"}}');
writefile(directory + 'broken.json', '{broken');
writefile(directory + 'wrong.json', '{"schema_version":4,"node":false}');
writefile(directory + 'large.json', sprintf('%1100000s', 'x'));
symlink(directory + 'current.json', directory + 'link.json');
const methods = loadfile('/src/root/usr/share/rpcd/ucode/luci.homeproxy')()['luci.homeproxy'];
const result = methods.multipath_status.call();
check(length(result.nodes) === 1 && result.nodes[0].node.tag === 'test', 'RPC must accept only valid regular schema-4 files');
check(length(result.incompatible_schemas) === 1 && result.incompatible_schemas[0] === 2, 'RPC must report old schema');
for (let name in ['current', 'old', 'broken', 'wrong', 'large', 'link']) unlink(directory + name + '.json');
print('PASS: real ucode RPC: schema 4, old-schema diagnostic, malformed/oversized/symlink rejection\n');

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
uci.set('homeproxy', 'multipath_example', 'multipath_download_receive_window_bytes', '128 MiB');
uci.set('homeproxy', 'multipath_example', 'multipath_download_path_stall_timeout_min', '2');
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
check(mp.download.send_buffer_bytes === '64MB' && mp.download.receive_window_bytes === '128 MiB', 'Window strings lost');
check(mp.download.path_stall_timeout_min === '2s', 'Stall floor not emitted as duration');
writefile('/tmp/homeproxy-beta8-zero.json', readfile('/var/run/homeproxy/sing-box-c.json'));

uci.set('homeproxy', 'multipath_example', 'multipath_download_activation_after_bytes', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_download_send_buffer_bytes', '67108864');
uci.set('homeproxy', 'multipath_example', 'multipath_download_receive_window_bytes', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_frame_size', '16384');
uci.set('homeproxy', 'multipath_example', 'multipath_memory_limit', '268435456');
uci.commit('homeproxy');
mp = generate();
check(mp.download.activation_after_bytes === 0 && mp.download.send_buffer_bytes === 67108864 && mp.download.receive_window_bytes === 0 && mp.memory_limit === 268435456 && mp.frame_size === 16384, 'Integer sizes lost');
writefile('/tmp/homeproxy-beta8-integer.json', readfile('/var/run/homeproxy/sing-box-c.json'));

for (let key in ['aggregation_enabled', 'leg0_traffic_saving', 'activation_on_queue', 'activation_threshold_mbps', 'activation_after_bytes', 'activation_after_bytes_min_mbps', 'send_buffer_bytes', 'receive_window_bytes', 'path_stall_timeout_min'])
 uci.delete('homeproxy', 'multipath_example', 'multipath_download_' + key);
uci.commit('homeproxy');
mp = generate();
for (let key in ['aggregation_enabled', 'leg0_traffic_saving', 'activation_on_queue', 'activation_threshold_mbps', 'activation_after_bytes', 'activation_after_bytes_min_mbps', 'send_buffer_bytes', 'receive_window_bytes', 'path_stall_timeout_min'])
 check(!(key in mp.download), 'Empty optional field must be omitted: ' + key);
print('PASS: full beta8 UCI generator: directional policies, legacy ignored, child recursion, false/zero, memory formats and defaults\n');

uci.set('homeproxy', 'multipath_example', 'multipath_failover_enabled', '1');
uci.set('homeproxy', 'multipath_example', 'multipath_failover_timeout', '7');
uci.set('homeproxy', 'multipath_example', 'multipath_failback_delay', '45');
uci.set('homeproxy', 'multipath_example', 'multipath_udp_outbound', 'secondary');
uci.commit('homeproxy');
mp = generate();
check(mp.failover_enabled === true && mp.failover_timeout === '7s' && mp.failback_delay === '45s', 'Recovery timers must be emitted in seconds');
check(mp.udp_outbound === mp.outbounds[1], 'UDP preference must remain independent');
writefile('/tmp/homeproxy-beta8-recovery.json', readfile('/var/run/homeproxy/sing-box-c.json'));
uci.set('homeproxy', 'multipath_example', 'multipath_failover_enabled', '0');
uci.commit('homeproxy');
mp = generate();
check(mp.failover_enabled === false && !('failover_timeout' in mp) && !('failback_delay' in mp), 'Disabled recovery must omit hidden timers');
print('PASS: recovery flag, durations, independent UDP preference and disabled timer omission\n');
