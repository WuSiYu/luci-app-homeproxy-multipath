// Run only in a disposable OpenWrt container: overwrites its test UCI config,
// /usr/bin/wget and /usr/share/ucode. For example:
//   podman run --rm -v $PWD:/src:Z docker.io/openwrt/rootfs:x86_64 \
//     ucode /src/.github/test-multipath-runtime.uc
import { readfile, writefile, mkdir, symlink, unlink, popen } from 'fs';
import { cursor } from 'uci';

function check(condition, message) {
	if (!condition) die(message);
}

// Modules the rootfs image lacks, and a bus for the scripts' RPC queries.
system('mkdir -p /usr/share/ucode /var/run/ubus && cp -r /src/.github/ucode-stubs/. /usr/share/ucode/');
system('(/sbin/ubusd &); sleep 1');

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

/* Certificate upload: PKCS#8 and SEC 1 keys, EC parameters, certificate chains */
function pem(label, lines) {
	return `-----BEGIN ${label}-----\n${join('\n', lines)}\n-----END ${label}-----\n`;
}
// Synthetic base64 bodies: the RPC checks PEM structure, not key material.
const body = ['TUlHSEFnRUFNQk1HQnlxR1NNNDlBZ0VHQ0NxR1NNNDlBd0VIQkcwd2F3SUJBUVFn', 'QUJDREVGR0g='];
function upload(name, content) {
	writefile('/tmp/homeproxy_certificate.tmp', content);
	return methods.certificate_write.call({ args: { filename: name } }).result;
}
for (let label in ['PRIVATE KEY', 'EC PRIVATE KEY', 'RSA PRIVATE KEY'])
	check(upload('server_privatekey', pem(label, body)) === true, 'Valid key rejected: ' + label);
check(upload('server_privatekey', pem('EC PARAMETERS', ['BggqhkjOPQMBBw==']) + pem('EC PRIVATE KEY', body)) === true, 'EC parameters before a key rejected');
check(upload('server_publickey', pem('CERTIFICATE', body) + '\r\n' + pem('CERTIFICATE', body)) === true, 'Certificate chain rejected');
check(readfile('/etc/homeproxy/certs/server_publickey.pem') === pem('CERTIFICATE', body) + '\n' + pem('CERTIFICATE', body), 'Certificate chain not stored');
for (let bad in [pem('ENCRYPTED PRIVATE KEY', body), pem('PRIVATE KEY', body) + pem('PRIVATE KEY', body), pem('EC PARAMETERS', ['BggqhkjOPQMBBw==']),
                 pem('PRIVATE KEY', ['not base64!']), '-----BEGIN PRIVATE KEY-----\n' + body[0] + '\n', 'text', chr(1) + pem('PRIVATE KEY', body)])
	check(upload('server_privatekey', bad) === false, 'Invalid key accepted: ' + bad);
check(upload('client_ca', pem('PRIVATE KEY', body)) === false && upload('client_ca', pem('CERTIFICATE', [])) === false, 'Invalid certificate accepted');
print('PASS: certificate upload accepts PKCS#8/SEC 1/PKCS#1 keys and chains, rejects encrypted, binary and malformed PEM\n');

/* Read-only role: no method or script that changes state */
const acl = json(readfile('/src/root/usr/share/rpcd/acl.d/luci-app-homeproxy.json'))['luci-app-homeproxy'];
const writes = ['acllist_write', 'certificate_write', 'log_clean', 'resources_update'];
for (let method in keys(methods)) {
	const readable = method in (acl.read.ubus?.['luci.homeproxy'] ?? []), writable = method in (acl.write.ubus?.['luci.homeproxy'] ?? []);
	check((method in writes) ? (writable && !readable) : (readable && !writable), 'Wrong ACL role for ' + method);
}
check(!('/etc/homeproxy/scripts/update_subscriptions.uc' in keys(acl.read.file)) && acl.write.file?.['/etc/homeproxy/scripts/update_subscriptions.uc']?.[0] === 'exec', 'Subscription update must need write access');
print('PASS: ACL grants state-changing RPC methods and subscription updates only to the write role\n');

/* Migration: out-of-range activation windows and a dangling default DNS server */
writefile('/etc/config/homeproxy', readfile('/src/root/etc/config/homeproxy'));
migration = cursor();
migration.set('homeproxy', 'dns', 'default_server', 'local-dns');
migration.set('homeproxy', 'old', 'node');
migration.set('homeproxy', 'old', 'type', 'multipath');
migration.set('homeproxy', 'old', 'multipath_upload_activation_window', '30');
migration.set('homeproxy', 'old', 'multipath_download_activation_window', '0');
migration.set('homeproxy', 'kept', 'node');
migration.set('homeproxy', 'kept', 'type', 'multipath');
migration.set('homeproxy', 'kept', 'multipath_upload_activation_window', '5');
migration.set('homeproxy', 'kept', 'multipath_download_activation_window', '500ms');
migration.commit('homeproxy');
check(system('ucode -L /src/root/etc/homeproxy/scripts /src/root/etc/homeproxy/scripts/migrate_config.uc') === 0, 'Migration failed');
migration = cursor();
check(migration.get('homeproxy', 'dns', 'default_server') === 'default-dns', 'Dangling default DNS server kept');
check(migration.get('homeproxy', 'old', 'multipath_upload_activation_window') === '10', 'Activation window above 10s not clamped');
check(migration.get('homeproxy', 'old', 'multipath_download_activation_window') == null, 'Zero activation window not cleared');
check(migration.get('homeproxy', 'kept', 'multipath_upload_activation_window') === '5' && migration.get('homeproxy', 'kept', 'multipath_download_activation_window') === '500ms', 'Valid activation windows changed');
migration.set('homeproxy', 'mydns', 'dns_server');
migration.set('homeproxy', 'dns', 'default_server', 'mydns');
migration.commit('homeproxy');
check(system('ucode -L /src/root/etc/homeproxy/scripts /src/root/etc/homeproxy/scripts/migrate_config.uc') === 0, 'Migration failed');
check(cursor().get('homeproxy', 'dns', 'default_server') === 'mydns', 'Existing DNS server replaced');
print('PASS: migration clamps activation windows to 10s, clears 0 and repairs a dangling default DNS server\n');

/* Custom routing: leg dial options do not depend on generation order */
writefile('/etc/config/homeproxy', readfile('/src/root/etc/config/homeproxy'));
let routing = cursor();
routing.set('homeproxy', 'config', 'routing_mode', 'custom');
routing.set('homeproxy', 'routing', 'default_outbound', 'route_mp');
// The multipath node's routing node comes before those of its legs.
const routes = [['route_mp', 'multipath_example', null], ['route_leg0', 'multipath_leg0_example', 'pppoe-a'], ['route_leg1', 'multipath_leg1_example', 'pppoe-b']];
for (let route in routes) {
	routing.set('homeproxy', route[0], 'routing_node');
	routing.set('homeproxy', route[0], 'enabled', '1');
	routing.set('homeproxy', route[0], 'node', route[1]);
	if (route[2])
		routing.set('homeproxy', route[0], 'bind_interface', route[2]);
}
routing.commit('homeproxy');
function outbound(tag) {
	return filter(json(readfile('/var/run/homeproxy/sing-box-c.json')).outbounds, (node) => node.tag === tag)[0];
}
check(system('ucode -L /src/root/etc/homeproxy/scripts /src/root/etc/homeproxy/scripts/generate_client.uc') === 0, 'Custom routing generation failed');
check(outbound('cfg-multipath_leg0_example-out').bind_interface === 'pppoe-a' && outbound('cfg-multipath_leg1_example-out').bind_interface === 'pppoe-b', 'Leg routing-node dial options lost');
writefile('/tmp/homeproxy-beta10-custom.json', readfile('/var/run/homeproxy/sing-box-c.json'));

/* A leg that carries UDP must support it */
routing.set('homeproxy', 'multipath_leg1_example', 'type', 'http');
routing.set('homeproxy', 'multipath_leg1_example', 'address', '192.0.2.1');
routing.set('homeproxy', 'multipath_leg1_example', 'port', '8080');
routing.set('homeproxy', 'multipath_example', 'multipath_udp_outbound', 'secondary');
routing.commit('homeproxy');
const generate_quiet = 'ucode -L /src/root/etc/homeproxy/scripts /src/root/etc/homeproxy/scripts/generate_client.uc 2>/dev/null';
check(system(generate_quiet) !== 0, 'TCP-only UDP leg accepted');
routing.set('homeproxy', 'multipath_example', 'multipath_udp_outbound', 'preferred');
routing.commit('homeproxy');
check(system(generate_quiet) === 0, 'TCP-only leg rejected though it carries no UDP');
routing.set('homeproxy', 'multipath_example', 'multipath_failover_enabled', '1');
routing.commit('homeproxy');
check(system(generate_quiet) !== 0, 'Failover accepted a TCP-only leg');
print('PASS: custom routing keeps leg dial options in any order; TCP-only legs cannot carry UDP or failover\n');

/* Subscription refresh keeps local settings and applies new subscription fields */
function md5(str) {
	writefile('/tmp/.md5-input', str);
	const p = popen('md5sum /tmp/.md5-input');
	const out = p.read('all');
	p.close();
	return substr(out, 0, 32);
}
writefile('/etc/config/homeproxy', readfile('/src/root/etc/config/homeproxy'));
const subscription = cursor();
const url = 'http://subscription.invalid/nodes', label = 'hy2-sub', name = md5(label);
subscription.set('homeproxy', 'subscription', 'subscription_url', [url]);
subscription.set('homeproxy', 'subscription', 'update_via_proxy', '1');
subscription.set('homeproxy', 'subscription', 'filter_nodes', 'disabled');
subscription.set('homeproxy', name, 'node');
// tls_alpn came from an older version of the subscription; bind_interface
// and the Hysteria2 bandwidth were set locally.
const stored = { label, type: 'hysteria2', address: 'old.example.com', port: '443', password: 'pw', tls: '1', tls_sni: 'old.example.com',
                 tls_alpn: 'h3', grouphash: md5(url), bind_interface: 'pppoe-a', hysteria_up_mbps: '500', hysteria_down_mbps: '900' };
for (let option in stored)
	subscription.set('homeproxy', name, option, stored[option]);
subscription.commit('homeproxy');
writefile('/tmp/subscription.b64', b64enc('hysteria2://pw@new.example.com:8443?sni=new.example.com&obfs=salamander&obfs-password=x#' + label));
writefile('/usr/bin/wget', '#!/bin/sh\ncat /tmp/subscription.b64\n');
system('chmod 755 /usr/bin/wget');
// Answer the script's feature query as a sing-box with QUIC support.
system(`ucode -e "import { connect } from 'ubus'; import * as uloop from 'uloop'; uloop.init(); const c = connect(); c.publish('luci.homeproxy', { singbox_get_features: { call: () => ({ with_quic: true }) } }); uloop.run();" & sleep 1`);
check(system('ucode -L /src/root/etc/homeproxy/scripts /src/root/etc/homeproxy/scripts/update_subscriptions.uc') === 0, 'Subscription update failed');
const refreshed = cursor().get_all('homeproxy', name);
check(refreshed.address === 'new.example.com' && refreshed.port === '8443' && refreshed.tls_sni === 'new.example.com', 'Subscription fields not updated: ' + readfile('/var/run/homeproxy/homeproxy.log'));
check(refreshed.bind_interface === 'pppoe-a' && refreshed.hysteria_up_mbps === '500' && refreshed.hysteria_down_mbps === '900', 'Local settings lost');
check(refreshed.hysteria_obfs_type === 'salamander' && refreshed.hysteria_obfs_password === 'x', 'New subscription fields not added');
check(refreshed.tls_alpn == null, 'Removed subscription field kept');
print('PASS: subscription refresh updates and adds subscription fields, drops removed ones, keeps WAN binding and Hysteria2 bandwidth\n');

/* Server: Hysteria (v1) receive windows; the generator lost recv_window_client */
writefile('/etc/config/homeproxy', readfile('/src/root/etc/config/homeproxy'));
const hy1 = cursor();
hy1.set('homeproxy', 'server', 'enabled', '1');
hy1.set('homeproxy', 'hy1_in', 'server');
const hy1_options = { enabled: '1', type: 'hysteria', port: '39001', hysteria_up_mbps: '100', hysteria_down_mbps: '100',
                      hysteria_recv_window_conn: '67108864', hysteria_recv_window_client: '15728640' };
for (let option in hy1_options)
	hy1.set('homeproxy', 'hy1_in', option, hy1_options[option]);
hy1.commit('homeproxy');
check(system('ucode -L /src/root/etc/homeproxy/scripts /src/root/etc/homeproxy/scripts/generate_server.uc') === 0, 'Server generator failed');
const hy1_inbound = filter(json(readfile('/var/run/homeproxy/sing-box-s.json')).inbounds, (node) => node.type === 'hysteria')[0];
check(hy1_inbound.recv_window_conn === 67108864 && hy1_inbound.recv_window_client === 15728640, 'Hysteria receive windows lost');
print('PASS: Hysteria server receive windows reach the configuration\n');

/* Init script: a jailed client can write multipath status files */
const init = readfile('/src/root/etc/init.d/homeproxy');
check(index(init, 'mkdir -p "$RUN_DIR/multipath-status"') >= 0 && index(init, 'procd_add_jail_mount_rw "$RUN_DIR/multipath-status/"') >= 0, 'Status directory not prepared for ujail');
print('PASS: init script creates and mounts the multipath status directory for ujail\n');
