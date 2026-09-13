# HomeProxy Multipath

An OpenWrt LuCI frontend based on HomeProxy, updated for sing-box 1.14 and extended with multipath node configuration, connection latency checks, and a live multipath status dashboard.

It is designed to work with [singbox-multipath](https://github.com/WuSiYu/singbox-multipath).

![Multipath status dashboard](screenshot.png)

The multipath node form accepts byte fields as either bare byte counts or memory
strings such as `2MB`; the latter uses sing-box's binary memory units. The
`activation_after_bytes_min_mbps` field adds a recent-rate gate to
`activation_after_bytes` without changing the existing throughput or leg 0 queue
triggers.

The **Enable local TX aggregation (upload)** switch maps to
`aggregation_enabled`. Turning it off keeps client upload data on the preferred
leg while server downlink aggregation and UDP remain available. The queue, rate,
and byte-count conditions are independent **OR** triggers; any enabled condition
can activate local aggregation. `activation_on_queue` toggles the sustained queue
trigger. A rate or byte threshold of `0` disables that trigger. The minimum rate
after bytes applies only to the byte-count trigger, and `0` removes that extra
gate. With all three triggers disabled, upload stays on the preferred leg.

An empty rate field uses sing-box's default: 150 Mbps when the byte trigger is
disabled, otherwise zero. Explicit zero and disabled switches are preserved in
the generated configuration. These options require a singbox-multipath build
with the corresponding activation controls.

The leg bandwidth values remain relative local TX scheduling weights, not rate
limits. The status page explains the normalized weight share and displays
download and upload cumulative traffic separately on each leg, including UDP
traffic when that child is selected for UDP.
