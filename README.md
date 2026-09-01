# HomeProxy Multipath

An OpenWrt LuCI frontend based on HomeProxy, updated for sing-box 1.14 and extended with multipath node configuration, connection latency checks, and a live multipath status dashboard.

It is designed to work with [singbox-multipath](https://github.com/WuSiYu/singbox-multipath).

![Multipath status dashboard](screenshot.png)

The multipath node form accepts byte fields as either bare byte counts or memory
strings such as `2MB`; the latter uses sing-box's binary memory units. The
`activation_after_bytes_min_mbps` field adds a recent-rate gate to
`activation_after_bytes` without changing the existing throughput or leg 0 queue
triggers.
