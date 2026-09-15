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
writefile(directory + 'current.json', '{"schema_version":3,"node":{"tag":"test"}}');
writefile(directory + 'old.json', '{"schema_version":2,"node":{"tag":"old"}}');
writefile(directory + 'broken.json', '{broken');
writefile(directory + 'wrong.json', '{"schema_version":3,"node":false}');
writefile(directory + 'large.json', sprintf('%1100000s', 'x'));
symlink(directory + 'current.json', directory + 'link.json');
const methods = loadfile('/src/root/usr/share/rpcd/ucode/luci.homeproxy')()['luci.homeproxy'];
const result = methods.multipath_status.call();
check(length(result.nodes) === 1 && result.nodes[0].node.tag === 'test', 'RPC must accept only valid regular schema-3 files');
check(length(result.incompatible_schemas) === 1 && result.incompatible_schemas[0] === 2, 'RPC must report old schema');
for (let name in ['current', 'old', 'broken', 'wrong', 'large', 'link']) unlink(directory + name + '.json');
print('PASS: real ucode RPC: schema 3, old-schema diagnostic, malformed/oversized/symlink rejection\n');

writefile('/etc/config/homeproxy', readfile('/src/root/etc/config/homeproxy'));
const uci = cursor();
uci.set('homeproxy', 'config', 'main_node', 'multipath_example');
uci.set('homeproxy', 'config', 'routing_mode', 'global');
// No external connections are opened; only generate and validate JSON.
uci.set('homeproxy', 'multipath_example', 'multipath_bandwidth_leg0_mbps', '160');
uci.set('homeproxy', 'multipath_example', 'multipath_bandwidth_leg1_mbps', '750');
uci.set('homeproxy', 'multipath_example', 'multipath_aggregation_enabled', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_activation_on_queue', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_activation_threshold_mbps', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_activation_after_bytes', '2MB');
uci.set('homeproxy', 'multipath_example', 'multipath_activation_after_bytes_min_mbps', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_memory_limit', '256MB');
uci.set('homeproxy', 'multipath_example', 'multipath_max_reorder_frames', '0');
uci.commit('homeproxy');

function generate() {
	check(system('ucode -L /src/root/etc/homeproxy/scripts /src/root/etc/homeproxy/scripts/generate_client.uc') === 0, 'Generator failed');
	let config = json(readfile('/var/run/homeproxy/sing-box-c.json'));
	let mp = filter(config.outbounds, node => node.type === 'multipath')[0];
	check(mp != null, 'Missing multipath outbound');
	check(!('bandwidth_mbps' in mp), 'Legacy bandwidth must not be emitted');
	check(length(filter(config.outbounds, node => node.tag === mp.outbounds[0] || node.tag === mp.outbounds[1])) === 2, 'Missing child outbounds');
	return mp;
}

let mp = generate();
check(mp.aggregation_enabled === false && mp.activation_on_queue === false, 'Disabled flags must be preserved');
check(mp.activation_threshold_mbps === 0 && mp.activation_after_bytes_min_mbps === 0 && mp.max_reorder_frames === 0, 'Explicit zero must be preserved');
check(mp.activation_after_bytes === '2MB' && mp.memory_limit === '256MB', 'Memory strings must be preserved');
writefile('/tmp/homeproxy-beta5-zero.json', readfile('/var/run/homeproxy/sing-box-c.json'));

uci.set('homeproxy', 'multipath_example', 'multipath_max_reorder_frames', '2048');
uci.set('homeproxy', 'multipath_example', 'multipath_bandwidth_leg0_mbps', 'ignored-old-value');
uci.delete('homeproxy', 'multipath_example', 'multipath_bandwidth_leg1_mbps');
uci.set('homeproxy', 'multipath_example', 'multipath_activation_after_bytes', '0');
uci.set('homeproxy', 'multipath_example', 'multipath_memory_limit', '268435456');
uci.commit('homeproxy');
mp = generate();
check(mp.max_reorder_frames === 2048 && mp.activation_after_bytes === 0 && mp.memory_limit === 268435456, 'Integer limits not emitted correctly');
writefile('/tmp/homeproxy-beta5-integer.json', readfile('/var/run/homeproxy/sing-box-c.json'));

for (let key in ['multipath_max_reorder_frames', 'multipath_activation_threshold_mbps', 'multipath_activation_after_bytes', 'multipath_activation_after_bytes_min_mbps', 'multipath_aggregation_enabled', 'multipath_activation_on_queue'])
	uci.delete('homeproxy', 'multipath_example', key);
uci.commit('homeproxy');
mp = generate();
for (let key in ['max_reorder_frames', 'activation_threshold_mbps', 'activation_after_bytes', 'activation_after_bytes_min_mbps', 'aggregation_enabled', 'activation_on_queue'])
	check(!(key in mp), 'Empty optional field must be omitted: ' + key);
print('PASS: full UCI generator: legacy weights ignored, child recursion, explicit zero/false, memory strings, chunk cap and omitted defaults\n');
