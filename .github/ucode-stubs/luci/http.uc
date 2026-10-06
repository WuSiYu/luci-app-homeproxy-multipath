// Test stand-in for the luci.http helpers HomeProxy imports, absent from the
// OpenWrt rootfs image.
export function urldecode(str, decode_plus) {
	if (str == null)
		return null;
	if (decode_plus)
		str = replace(str, /\+/g, ' ');
	return replace(str, /%([0-9a-fA-F]{2})/g, (m, h) => chr(hex(h)));
};

export function urlencode(str) {
	return replace(str, /[^A-Za-z0-9_.~-]/g, (c) => sprintf('%%%02X', ord(c)));
};

export function urldecode_params(url, tbl) {
	const params = tbl ?? {};
	if (index(url, '?') >= 0)
		url = substr(url, index(url, '?') + 1);
	for (let pair in split(url, /[&;]+/)) {
		const kv = split(pair, '=', 2);
		const key = urldecode(kv[0], true);
		if (length(key))
			params[key] = urldecode(kv[1], true);
	}
	return params;
};
