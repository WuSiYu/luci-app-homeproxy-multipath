// Test stand-in for ucode-mod-math, absent from the OpenWrt rootfs image.
export function isnan(x) {
	return x != x;
};
