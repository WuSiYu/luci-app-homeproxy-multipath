# HomeProxy Multipath

An OpenWrt LuCI frontend based on HomeProxy, updated for sing-box 1.14 and extended with multipath node configuration, connection latency checks, and a live multipath status dashboard.

It is designed to work with [singbox-multipath](https://github.com/WuSiYu/singbox-multipath).

![Multipath status dashboard](screenshot.png)

This branch targets **sing-box v1.14.1-multipath-beta8**, multipath wire protocol
v11 and status schema 4. Upgrade both multipath endpoints and this LuCI package
together.

The client node form owns separate **Upload** and **Download** policies. Each has
an aggregation master switch, an optional **Save leg0 traffic** switch, and three
numbered activation conditions: **1. queue OR 2. rate OR 3. cumulative bytes**.
Condition 3 alone can also require a minimum average rate. Zero numeric thresholds
disable their condition; an omitted rate defaults to 150 Mbps unless a byte trigger
is configured. Disabling the master hides activation fields without clearing their
saved values.

Traffic-saving changes activated traffic from aggregation to leg1-only new DATA.
Healthy leg1 backpressure waits instead of spilling onto leg0. Failures, stalls,
memory protection, control frames and reinjection may still use leg0; this is not
a zero-traffic guarantee. Activation persists for the connection lifetime, and UDP
selection remains independent.

The common `frame_size` replaces `chunk_size`. Directional `queue_frames`
limits unsent data in frame-size units; `send_buffer_bytes` covers unsent and
unacknowledged data on both legs. `receive_window_bytes` applies at the direction's
receiver: server for upload and client for download. There is no frame-count receive
limit. `path_stall_timeout_min` replaces `leg1_replay_timeout`, expressing a floor
on adaptive no-progress detection rather than a fixed retry timer.
Memory sizes accept integer bytes or binary strings such as `2MB` and `64 MB`.
The `KB`/`MB`/`GB` suffixes use binary units; `KiB`/`MiB`/`GiB` suffixes are not accepted.
Automatic buffer ceilings resolve against the owning host's `memory_limit`;
the client cannot override the server's node-wide budget.

Old flat UCI tuning fields are **ignored, not migrated**. The form lists legacy
keys and the generator warns about them. They are not emitted into sing-box JSON.
Reconfigure both directions explicitly; remove directional tuning from the server.
The matching sing-box beta8 similarly warns and ignores recognized legacy JSON
fields, while rejecting unknown fields or invalid new settings.

## Multipath Status

The client-only **Enable TCP and UDP failover** switch is off by default. It adds
shared path health checks only when enabled. The server always accepts recovery
sessions and listens on TCP and UDP; it has no `failover_enabled` field. Remove
that field from existing server inbound configurations. Both children must reach
the server's TCP and UDP listening port when recovery is enabled.
The failure timeout defaults to 5 seconds; the preferred-path stability period
defaults to 30 seconds. Both are editable in LuCI and hidden, with values retained,
when recovery is off. Recovery is independent of the aggregation switches.

TCP can retain its target connection on leg1 during a leg0 outage. UDP uses the
common server relay from the beginning, retaining its source socket across switches.
The UDP selector remains an independent preference: selecting leg1 keeps UDP there
when TCP returns to leg0. UDP is not aggregated or carried inside TCP.
With recovery disabled, UDP keeps its existing direct child forwarding behavior.

The top-level status page refreshes every second. A topology diagram links the
aggregate node to leg0 and leg1, with separate upload and download arrows. Each
leg includes directional cumulative traffic, peak speeds, and the ten currently
fastest TCP flows. UDP has separate per-leg counters, including earlier traffic on
a path that is no longer selected. Recovery details show the selected TCP/UDP paths,
the two timers, shared path health, reply ages and continuous healthy time.

Upload/download policy sections show activation conditions, requested and effective
buffer limits, and current sender mode counts. Remote values remain unavailable or
stale when there is no fresh server sample, rather than being shown as zero.

Collapsible details distinguish whole-path in-flight data, connection send
history, reinjected bytes/mappings, writer blocking, receive reordering and the
shared memory budget. Download sender counters and delivery estimates come from
server telemetry. Unavailable and stale samples are explicitly marked; delivery
RTT and probe timeout ratios are not physical ping latency or raw IP loss rates.
Hover over a row label for definitions and units. Non-harmless leg events can be
dismissed until a new event arrives. Confirmed local or remote application-endpoint
closures are filtered using sing-box's `last_error_source`, not error-message
matching. Unattributed EOF, reset and cancellation events remain visible. The
destination identifies the affected flow, not a proven fault location. The updated
sing-box excludes confirmed endpoint closures from event/failure counts; other
hidden harmless events may still be counted. Error provenance requires
beta8 on both endpoints.

Reorder counts are 16 KiB storage pages, not wire frames. Their peaks are the
largest per-connection peaks among currently active connections, and can drop
when a connection closes. Send-history and path in-flight peaks persist since
process start and take the maximum of sampled node totals and observed
per-connection peaks; they are not exact continuous aggregate high-water marks.
An older status schema is rejected with an upgrade notice rather than displayed
with current labels.

Leg joins count locally attached transports independently of upload activation.
Joins, attempts and reported remote failure counts include closed connections.
Probe RTT and probe-health values, in contrast, summarize currently active
connections only. Remote scheduler estimates are not one-second throughput or
physical capacity; their DATA-feedback RTT follows the selected data leg outward
and the current control leg for the feedback. Stall detections do not necessarily cause reinjection,
and accumulated sender wait time is not a single continuous pause.
