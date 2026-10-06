// Test stand-in for ucode-mod-digest, absent from the OpenWrt rootfs image.
import { popen, writefile } from 'fs';

export function md5(str) {
	writefile('/tmp/.digest-stub-input', str);
	const p = popen('md5sum /tmp/.digest-stub-input');
	const out = p.read('all');
	p.close();
	return substr(out, 0, 32);
};
