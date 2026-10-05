# HomeProxy Multipath

An OpenWrt LuCI frontend based on HomeProxy, updated for sing-box 1.14 and extended with multipath node configuration, a multipath server inbound, connection latency checks, and a live multipath status dashboard.

It is designed to work with [singbox-multipath](https://github.com/WuSiYu/singbox-multipath).

![Multipath status dashboard](screenshot.png)

This branch targets **sing-box v1.14.1-multipath-beta10**, multipath wire protocol
v13 and status schema 5. Upgrade both multipath endpoints and this LuCI package
together; an endpoint with a different protocol version is rejected with an
explicit reason, and an older status schema is shown as an upgrade notice.

## Client node

A multipath node combines two existing nodes. Bind each leg to the device of a
different uplink (for example `pppoe-wan` and `pppoe-wan2`); the form warns when
both legs bind the same interface or neither binds one, because two legs leaving
through the same line cannot aggregate two lines.

Set the same **Pre-shared key** on the node and on the server inbound. Every
handshake is then authenticated with HMAC-SHA256 and checked against replay. The
key does not encrypt data; the child nodes do.

**The defaults are the recommended values.** Leave activation and buffer fields
empty unless you need a specific behavior:

- Each of **Upload** and **Download** has an aggregation master switch, an optional
  **Save leg0 traffic** switch and three activation conditions:
  **1. leg0 is the bottleneck OR 2. average rate OR 3. cumulative bytes**.
  Condition 1 (on by default) waits until unsent data stay high for the activation
  window (default 200ms) and leg0's delivery rate has stopped growing. Condition 2
  is off unless a rate is set; for the behavior before beta10 use 150 Mbps with a
  1s window. Disabling the master hides activation fields without clearing them.
- **Advanced ceilings** (`queue_frames`, send history, receive window) are upper
  bounds. The working values follow path rates, round-trip times and memory shares
  automatically; values set only to enlarge buffers can be removed.
- Durations accept `500ms`, `2s`, `1m` or `1h`, and a bare number means seconds.
  Ranges: activation window 20ms–10s, path stall floor 100ms–5m, handshake 1–60s,
  failover timeout 1s–5m, failback stability 1s–1h.
- **Multipath early write** (on by default) sends the handshake with the first data.
  TCP Fast Open inside the child nodes is set on those nodes.

Sessions survive the loss of either leg without any extra option: control and
feedback travel on both legs, and a lost leg is redialed and rejoins its session.
The optional client-only **TCP and UDP failover** adds shared health checks, path
selection for new sessions, a UDP relay that keeps the server UDP socket across
path switches, and session retention across long outages. Both children must then
reach the server port over TCP and UDP. UDP is never aggregated.

Memory sizes accept integer bytes or binary strings such as `2MB` and `64 MB`
(`KB`/`MB`/`GB` are binary units; `KiB`/`MiB` suffixes are not accepted).

Old flat UCI tuning fields are **ignored, not migrated**; the form lists them and
the generator warns about them. On upgrade, the migration moves the node's TCP Fast
Open flag to **Multipath early write**, drops a `queue_frames` equal to the default,
and lets the untouched example node follow the new activation defaults.

## Server inbound

The server page offers a **Multipath** inbound with listen address and port,
pre-shared key, allowed source prefixes, memory limit and handshake timeout.
Directional policies arrive from the clients. Without a key or allowed sources on
a public address, sing-box warns that anyone who can reach the port can relay
through it. The firewall option opens the port for TCP and UDP.

## Multipath status

The status page refreshes every second. A topology diagram links the aggregate
node to leg0 and leg1 with separate upload and download arrows. Each leg includes
cumulative traffic, peak speeds, the ten fastest TCP flows and, when selected or
used by failover, UDP counters.

- **Policies** show each direction's activation conditions and, for each ceiling,
  the live value: unsent limit and send-history limit (largest among open
  connections; download values come from the server) and the receive window share.
- **Legs** show bytes in flight against the path limit in each direction, writer
  queues, window feedback frames sent and received, the remote scheduler's delivery
  estimate and feedback RTT, joins, attempts and probe statistics.
- **Live buffers** show connection send history, repairs (receiver-dropped ranges,
  failed paths and opportunistic reinjection), opportunistic and tail reinjection
  counts, sender backpressure, receive reordering, memory regions (TX, RX, reserved,
  cache) and fair shares.
- Leg events explain handshake rejections such as a wrong pre-shared key or a
  protocol version mismatch. Confirmed application-endpoint closures are filtered
  using sing-box's `last_error_source`, not message matching.

Remote values are marked unavailable or stale when there is no fresh server
sample, rather than shown as zero. Delivery RTT and probe timeout ratios are not
physical ping latency or raw IP loss. Reorder counts are 16 KiB storage pages, not
wire frames. Hover over a row label for definitions and units.
