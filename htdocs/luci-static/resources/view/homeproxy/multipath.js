/*
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * Copyright (C) 2026 HomeProxy contributors
 */

'use strict';
'require dom';
'require poll';
'require rpc';
'require view';

const callMultipathStatus = rpc.declare({
	object: 'luci.homeproxy',
	method: 'multipath_status',
	expect: { '': {} }
});

const sectionState = new Map();
const dismissedEventPrefix = 'homeproxy.multipath.dismissed-event.';

const css = `
.mp-page {
	--mp-border: #d7dce2;
	--mp-muted: #65707d;
	--mp-panel: #fff;
	--mp-soft: #f5f7f9;
	--mp-rx: #1683d8;
	--mp-tx: #d98618;
	--mp-good: #238636;
	--mp-warn: #a15c00;
	--mp-bad: #c93c37;
	--mp-idle: #68717d;
	color: #20252b;
}
.mp-toolbar {
	display: flex;
	align-items: end;
	justify-content: space-between;
	gap: 16px;
	margin: 12px 0 14px;
}
.mp-toolbar h2 {
	margin: 0 0 3px;
	font-size: 1.45rem;
	letter-spacing: 0;
}
.mp-toolbar-meta {
	color: var(--mp-muted);
	font-size: .82rem;
}
.mp-selector {
	display: flex;
	align-items: center;
	gap: 8px;
}
.mp-selector label {
	color: var(--mp-muted);
	font-size: .82rem;
}
.mp-selector select {
	min-width: 220px;
}
.mp-notice {
	border-left: 4px solid var(--mp-warn);
	background: #fff7e8;
	padding: 9px 12px;
	margin-bottom: 14px;
}
.mp-empty {
	border: 1px solid var(--mp-border);
	background: var(--mp-panel);
	padding: 28px;
	text-align: center;
	color: var(--mp-muted);
	border-radius: 6px;
}
.mp-topology {
	display: grid;
	grid-template-columns: minmax(310px, .92fr) minmax(132px, .28fr) minmax(440px, 1.28fr);
	grid-template-rows: minmax(300px, auto) minmax(300px, auto);
	gap: 16px 0;
	align-items: stretch;
}
.mp-panel {
	border: 1px solid var(--mp-border);
	background: var(--mp-panel);
	border-radius: 6px;
	box-shadow: 0 1px 2px rgba(0, 0, 0, .04);
	padding: 16px;
	min-width: 0;
}
.mp-aggregate {
	grid-column: 1;
	grid-row: 1 / 3;
}
.mp-leg0 {
	grid-column: 3;
	grid-row: 1;
}
.mp-leg1 {
	grid-column: 3;
	grid-row: 2;
}
.mp-panel-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	padding-bottom: 12px;
	border-bottom: 1px solid var(--mp-border);
}
.mp-panel-header h3 {
	font-size: 1rem;
	line-height: 1.35;
	letter-spacing: 0;
	margin: 0;
	word-break: break-word;
}
.mp-panel-subtitle {
	color: var(--mp-muted);
	font-size: .78rem;
	margin-top: 3px;
	word-break: break-all;
}
.mp-state {
	flex: none;
	padding: 3px 7px;
	border: 1px solid currentColor;
	border-radius: 3px;
	font-size: .72rem;
	font-weight: 600;
	white-space: nowrap;
}
.mp-state-good { color: var(--mp-good); background: #effaf1; }
.mp-state-warn { color: var(--mp-warn); background: #fff7e8; }
.mp-state-bad { color: var(--mp-bad); background: #fff1f0; }
.mp-state-idle { color: var(--mp-idle); background: var(--mp-soft); }
.mp-metrics {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1px;
	background: var(--mp-border);
	border: 1px solid var(--mp-border);
	margin: 14px 0;
}
.mp-metric {
	background: var(--mp-panel);
	padding: 10px;
	min-height: 58px;
}
.mp-metric-label {
	color: var(--mp-muted);
	font-size: .72rem;
	margin-bottom: 4px;
}
.mp-metric-value {
	font-size: 1.12rem;
	font-weight: 650;
	line-height: 1.2;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}
.mp-rx { color: var(--mp-rx); }
.mp-tx { color: var(--mp-tx); }
.mp-section {
	margin-top: 10px;
	min-width: 0;
}
.mp-section-title {
	font-size: .78rem;
	font-weight: 650;
	margin: 0;
	padding: 7px 2px;
	color: #363d45;
	cursor: pointer;
	user-select: none;
	border-bottom: 1px solid #edf0f2;
}
.mp-section-title::marker {
	color: var(--mp-muted);
}
.mp-section-title:hover {
	color: #111820;
}
.mp-section-title:focus-visible {
	outline: 2px solid var(--mp-rx);
	outline-offset: 2px;
}
.mp-section-content {
	min-width: 0;
}
.mp-traffic-row,
.mp-mode-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto auto;
	gap: 10px;
	align-items: center;
	padding: 7px 0;
	border-bottom: 1px solid #edf0f2;
	font-size: .8rem;
}
.mp-mode-row {
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px 14px;
}
.mp-mode-row > span {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	min-width: 0;
}
.mp-traffic-row strong,
.mp-mode-row strong {
	font-variant-numeric: tabular-nums;
	text-align: right;
}
.mp-params {
	display: grid;
	grid-template-columns: minmax(125px, .8fr) minmax(0, 1.2fr);
	gap: 0 12px;
	margin: 0;
	font-size: .78rem;
}
.mp-params dt,
.mp-params dd {
	margin: 0;
	padding: 6px 0;
	border-bottom: 1px solid #edf0f2;
}
.mp-params dt { color: var(--mp-muted); }
.mp-params dd {
	text-align: right;
	font-variant-numeric: tabular-nums;
	word-break: break-word;
}
.mp-params-segment {
	white-space: nowrap;
	word-break: normal;
}
.mp-params-separator {
	white-space: normal;
}
.mp-meter {
	height: 6px;
	background: #e8ebef;
	overflow: hidden;
	margin-top: 8px;
}
.mp-meter > span {
	display: block;
	height: 100%;
	background: var(--mp-tx);
	transition: width .2s ease;
}
.mp-leg-event {
	border-left: 3px solid var(--mp-bad);
	background: #fff6f5;
	margin-top: 10px;
	padding: 9px 10px;
	font-size: .76rem;
	line-height: 1.45;
	word-break: break-word;
}
.mp-leg-event-transient {
	border-left-color: var(--mp-warn);
	background: #fff9ed;
}
.mp-event-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-weight: 650;
}
.mp-event-badge {
	flex: none;
	border: 1px solid currentColor;
	border-radius: 3px;
	padding: 1px 5px;
	font-size: .68rem;
	font-weight: 600;
}
.mp-event-actions {
	display: flex;
	align-items: center;
	gap: 6px;
}
.mp-event-close {
	width: 24px;
	height: 24px;
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--mp-muted);
	font-size: 1.1rem;
	line-height: 1;
	cursor: pointer;
}
.mp-event-close:hover,
.mp-event-close:focus-visible {
	color: #20252b;
	background: rgba(0, 0, 0, .06);
}
.mp-leg-event-transient .mp-event-badge { color: var(--mp-warn); }
.mp-leg-event-fault .mp-event-badge { color: var(--mp-bad); }
.mp-event-message {
	font-family: monospace;
	margin: 7px 0;
}
.mp-event-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 3px 14px;
	color: var(--mp-muted);
}
.mp-event-grid span {
	min-width: 0;
	word-break: break-word;
}
.mp-event-grid strong {
	color: #363d45;
	font-weight: 600;
}
.mp-event-hint {
	margin-top: 7px;
	color: #4d5864;
}
.mp-connector {
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 8px;
	padding: 0 9px;
	min-width: 0;
}
.mp-link0 { grid-column: 2; grid-row: 1; }
.mp-link1 { grid-column: 2; grid-row: 2; }
.mp-link-label {
	display: flex;
	justify-content: space-between;
	gap: 7px;
	font-size: .7rem;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}
.mp-link-lane {
	position: relative;
	width: calc(100% - 16px);
	margin: 0 8px;
	height: var(--lane-size, 2px);
	min-height: 2px;
	background: currentColor;
	opacity: var(--lane-opacity, .3);
	transition: height .2s ease, opacity .2s ease;
}
.mp-link-tx { color: var(--mp-tx); }
.mp-link-rx { color: var(--mp-rx); }
.mp-link-tx::after,
.mp-link-rx::before {
	content: '';
	position: absolute;
	top: 50%;
	transform: translateY(-50%);
	width: 8px;
	height: 12px;
	background: currentColor;
}
.mp-link-tx::after {
	right: -8px;
	clip-path: polygon(0 0, 100% 50%, 0 100%);
}
.mp-link-rx::before {
	left: -8px;
	clip-path: polygon(100% 0, 0 50%, 100% 100%);
}
.mp-table-wrap {
	overflow-x: auto;
	margin-top: 6px;
}
.mp-flow-table {
	width: 100%;
	min-width: 640px;
	border-collapse: collapse;
	table-layout: fixed;
	font-size: .74rem;
}
.mp-flow-table th,
.mp-flow-table td {
	padding: 6px 7px;
	border-bottom: 1px solid #e9edf0;
	text-align: right;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}
.mp-flow-table th {
	color: var(--mp-muted);
	font-weight: 600;
	background: var(--mp-soft);
}
.mp-flow-table th:first-child,
.mp-flow-table td:first-child {
	width: 34%;
	text-align: left;
	overflow: hidden;
	text-overflow: ellipsis;
}
.mp-flow-table th:nth-child(2),
.mp-flow-table td:nth-child(2) { width: 12%; }
.mp-flow-empty {
	color: var(--mp-muted);
	text-align: center !important;
	padding: 16px !important;
}
@media (max-width: 1050px) {
	.mp-topology {
		grid-template-columns: minmax(280px, .9fr) 105px minmax(390px, 1.1fr);
	}
	.mp-link-label { flex-direction: column; gap: 2px; }
}
@media (max-width: 820px) {
	.mp-toolbar { align-items: stretch; flex-direction: column; }
	.mp-selector { align-items: stretch; flex-direction: column; }
	.mp-selector select { width: 100%; min-width: 0; }
	.mp-topology { display: flex; flex-direction: column; gap: 12px; }
	.mp-connector { min-height: 58px; padding: 0 16px; }
	.mp-link-label { flex-direction: row; }
	.mp-panel { padding: 13px; }
	.mp-flow-table { min-width: 0; font-size: .7rem; }
	.mp-flow-table th:nth-child(2), .mp-flow-table td:nth-child(2),
	.mp-flow-table th:nth-child(3), .mp-flow-table td:nth-child(3),
	.mp-flow-table th:nth-child(6), .mp-flow-table td:nth-child(6) { display: none; }
	.mp-flow-table th:first-child, .mp-flow-table td:first-child { width: 42%; }
	.mp-flow-table th:nth-child(4), .mp-flow-table td:nth-child(4),
	.mp-flow-table th:nth-child(5), .mp-flow-table td:nth-child(5) { width: 29%; }
	.mp-event-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-color-scheme: dark) {
	.mp-page {
		--mp-border: #46505b;
		--mp-muted: #aab2bd;
		--mp-panel: #242a30;
		--mp-soft: #30373f;
		color: #edf1f5;
	}
	.mp-panel { box-shadow: none; }
	.mp-section-title { color: #e0e5ea; border-color: #3b434c; }
	.mp-section-title:hover { color: #fff; }
	.mp-traffic-row, .mp-mode-row, .mp-params dt, .mp-params dd, .mp-flow-table th, .mp-flow-table td { border-color: #3b434c; }
	.mp-state-good { background: #17351f; }
	.mp-state-warn, .mp-notice { background: #3b2d15; }
	.mp-state-bad { background: #3c2020; }
	.mp-meter { background: #404851; }
	.mp-leg-event-transient { background: #3b2d15; }
	.mp-leg-event-fault { background: #3c2020; }
	.mp-event-grid strong, .mp-event-hint { color: #e0e5ea; }
}`;

function number(value) {
	value = Number(value);
	return Number.isFinite(value) ? value : 0;
}

function formatBytes(value) {
	value = Math.max(0, number(value));
	const units = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB' ];
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	const digits = value >= 100 || unit === 0 ? 0 : (value >= 10 ? 1 : 2);
	return value.toFixed(digits) + ' ' + units[unit];
}

function formatRate(value) {
	return formatBytes(value) + '/s';
}

function formatAge(seconds) {
	seconds = Math.max(0, Math.floor(number(seconds)));
	const hours = Math.floor(seconds / 3600),
	      minutes = Math.floor((seconds % 3600) / 60),
	      rest = seconds % 60;
	return hours ? '%d:%02d:%02d'.format(hours, minutes, rest) : '%02d:%02d'.format(minutes, rest);
}

function formatDuration(milliseconds) {
	milliseconds = number(milliseconds);
	if (milliseconds >= 1000)
		return (milliseconds / 1000).toFixed(milliseconds % 1000 ? 1 : 0) + ' s';
	return milliseconds + ' ms';
}

function formatLatency(milliseconds) {
	milliseconds = number(milliseconds);
	if (milliseconds <= 0)
		return '-';
	return (milliseconds < 10 ? milliseconds.toFixed(1) : milliseconds.toFixed(0)) + ' ms';
}

function formatPercent(numerator, denominator) {
	numerator = number(numerator);
	denominator = number(denominator);
	return denominator > 0 ? (numerator * 100 / denominator).toFixed(1) + '%' : '-';
}

function formatTime(value) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function legEventCategory(category, message) {
	if (category)
		return category;
	message = String(message || '').toLowerCase();
	if (message === 'eof' || message.indexOf('closed') >= 0)
		return 'peer_closed';
	if (message.indexOf('multipath hello rejected') >= 0)
		return 'hello_rejected';
	if (message.indexOf('replay') >= 0 && message.indexOf('timeout') >= 0)
		return 'replay_timeout';
	if (message.indexOf('timeout') >= 0)
		return 'timeout';
	return 'transport_error';
}

function legEventCategoryLabel(category) {
	const categories = {
		peer_closed: _('Peer closed'),
		hello_rejected: _('Hello rejected'),
		replay_timeout: _('Replay timeout'),
		timeout: _('Timeout'),
		transport_error: _('Transport error')
	};
	return categories[category] || category || _('Unknown');
}

function legEventStageLabel(stage) {
	const stages = {
		secondary_dial: _('Secondary dial'),
		secondary_handshake: _('Secondary handshake'),
		secondary_attach: _('Secondary attach'),
		handshake_response: _('Primary handshake response'),
		read_data: _('Data read'),
		write_data: _('Data write'),
		write_control: _('Control write'),
		replay_timeout: _('Replay watchdog')
	};
	return stages[stage] || stage || _('Unknown');
}

function legEventHint(category, message) {
	message = String(message || '').toLowerCase();
	if (category === 'peer_closed')
		return _('The peer closed this leg. This commonly appears when a short connection ends; investigate the underlying outbound only if the count rises while active traffic stalls.');
	if (category === 'hello_rejected' && message.indexOf('session no longer exists') >= 0)
		return _('The booster reached the server after the control session had already closed. This is expected for some short connections because leg1 is established asynchronously.');
	if (category === 'hello_rejected' && message.indexOf('unspecified by server') >= 0)
		return _('The server rejected this leg but did not provide a reason. Upgrade the server binary to obtain a detailed rejection reason.');
	if (category === 'hello_rejected')
		return _('The server rejected this leg during the multipath handshake. The message above contains the server-provided reason when available.');
	if (category === 'replay_timeout')
		return _('The booster did not make replay progress before the watchdog expired. The connection continues on the preferred leg.');
	if (category === 'timeout')
		return _('A dial or handshake operation timed out. The booster will be retried while the preferred leg remains available.');
	return _('The leg failed during transport I/O. Use the stage and destination below to identify the affected operation.');
}

function legEventIsHarmless(leg, category) {
	if (Object.prototype.hasOwnProperty.call(leg, 'last_error_harmless'))
		return !!leg.last_error_harmless;
	const message = String(leg.last_error || '').toLowerCase();
	return message === 'eof' || (category === 'hello_rejected' &&
		(message.indexOf('session no longer exists') >= 0 || message.indexOf('leg already attached') >= 0));
}

function legEventSignature(leg) {
	return [ leg.last_error_at || '', number(leg.error_count), leg.last_error_stage || '', leg.last_error || '' ].join('|');
}

function legEventStorageKey(nodeTag, leg) {
	return dismissedEventPrefix + encodeURIComponent(String(nodeTag || '-') + ':' + String(leg.id) + ':' + String(leg.tag || '-'));
}

function dismissedLegEvent(nodeTag, leg) {
	try {
		return window.localStorage.getItem(legEventStorageKey(nodeTag, leg));
	} catch (error) {
		return null;
	}
}

function dismissLegEvent(nodeTag, leg) {
	try {
		window.localStorage.setItem(legEventStorageKey(nodeTag, leg), legEventSignature(leg));
	} catch (error) {
		/* Storage can be unavailable in private browsing; the current element is still removed. */
	}
}

function renderLegEvent(nodeTag, leg) {
	if (!leg.last_error)
		return '';
	const category = legEventCategory(leg.last_error_category, leg.last_error);
	if (legEventIsHarmless(leg, category))
		return '';
	if (dismissedLegEvent(nodeTag, leg) === legEventSignature(leg))
		return '';
	const hasTransientFlag = Object.prototype.hasOwnProperty.call(leg, 'last_error_transient'),
	      transient = hasTransientFlag ? !!leg.last_error_transient :
		      (category === 'peer_closed' || category === 'replay_timeout' || category === 'timeout'),
	      details = [
			[ _('Category'), legEventCategoryLabel(category) ],
			[ _('Stage'), legEventStageLabel(leg.last_error_stage) ],
			[ _('Destination'), leg.last_error_destination || '-' ],
			[ _('Session'), leg.last_error_session_id ? '#' + leg.last_error_session_id : '-' ],
			[ _('Attempt'), number(leg.last_error_attempt) ? String(number(leg.last_error_attempt)) : '-' ],
			[ _('Occurrences'), number(leg.error_count) ? String(number(leg.error_count)) : '-' ],
			[ _('Recorded at'), leg.last_error_at ? formatTime(leg.last_error_at) : '-' ]
	      ],
	      grid = [];
	details.forEach((detail) => grid.push(E('span', {}, [ detail[0] + ': ', E('strong', {}, [ detail[1] ]) ])));
	return E('div', { 'class': 'mp-leg-event mp-leg-event-' + (transient ? 'transient' : 'fault') }, [
		E('div', { 'class': 'mp-event-header' }, [
			E('span', {}, [ _('Last recorded leg event') ]),
			E('div', { 'class': 'mp-event-actions' }, [
				E('span', { 'class': 'mp-event-badge' }, [ transient ? _('Transient') : _('Fault') ]),
				E('button', {
					'class': 'mp-event-close',
					'type': 'button',
					'title': _('Dismiss until a new event occurs'),
					'aria-label': _('Dismiss until a new event occurs'),
					'click': (event) => {
						dismissLegEvent(nodeTag, leg);
						const element = event.currentTarget.closest('.mp-leg-event');
						if (element)
							element.remove();
					}
				}, [ '×' ])
			])
		]),
		E('div', { 'class': 'mp-event-message' }, [ leg.last_error ]),
		E('div', { 'class': 'mp-event-grid' }, grid),
		E('div', { 'class': 'mp-event-hint' }, [ legEventHint(category, leg.last_error) ])
	]);
}

function displayTag(tag) {
	return String(tag || '').replace(/^cfg-/, '').replace(/-out$/, '') || '-';
}

function stateInfo(state) {
	const states = {
		aggregating: [ _('Aggregating'), 'good' ],
		carrying: [ _('Carrying traffic'), 'good' ],
		preferred_only: [ _('Preferred only'), 'idle' ],
		standby: [ _('Standby'), 'idle' ],
		connecting: [ _('Connecting'), 'warn' ],
		retrying: [ _('Retrying'), 'warn' ],
		booster_degraded: [ _('Booster degraded'), 'bad' ],
		offline: [ _('Offline'), 'bad' ],
		idle: [ _('Idle'), 'idle' ]
	};
	return states[state] || [ state || _('Unknown'), 'idle' ];
}

function renderState(state, stale) {
	const info = stale ? stateInfo('offline') : stateInfo(state);
	return E('span', { 'class': 'mp-state mp-state-' + info[1] }, [ info[0] ]);
}

function renderMetric(label, value, className) {
	return E('div', { 'class': 'mp-metric' }, [
		E('div', { 'class': 'mp-metric-label' }, [ label ]),
		E('div', { 'class': 'mp-metric-value ' + (className || '') }, [ value ])
	]);
}

function renderParameterValue(value) {
	const text = String(value);
	const segments = text.split(' · ');
	if (segments.length === 1)
		return text;

	const children = [];
	segments.forEach((segment, index) => {
		if (index)
			children.push(E('span', { 'class': 'mp-params-separator' }, [ ' · ' ]));
		children.push(E('span', { 'class': 'mp-params-segment' }, [ segment ]));
	});
	return E('span', {}, children);
}

function renderParameters(entries) {
	const children = [];
	entries.forEach((entry) => {
		children.push(E('dt', entry[2] ? { 'title': entry[2] } : {}, [ entry[0] ]));
		children.push(E('dd', {}, [ renderParameterValue(entry[1]) ]));
	});
	return E('dl', { 'class': 'mp-params' }, children);
}

function renderCollapsible(key, title, content) {
	const open = sectionState.has(key) ? sectionState.get(key) : true;
	return E('details', {
		'class': 'mp-section',
		'open': open ? '' : null,
		'toggle': (event) => sectionState.set(key, event.currentTarget.open)
	}, [
		E('summary', { 'class': 'mp-section-title' }, [ title ]),
		E('div', { 'class': 'mp-section-content' }, content)
	]);
}

function activationDescription(activation) {
	if (!activation)
		return '-';
	const reasons = {
		bytes: _('Transferred bytes'),
		throughput: _('Throughput'),
		leg0_queue: _('Preferred queue')
	};
	let description = reasons[activation.reason] || activation.reason;
	if (activation.reason === 'throughput')
		description += ' · ' + (number(activation.rate_bytes_per_second) * 8 / 1000000).toFixed(1) + ' Mbps';
	else if (activation.reason === 'bytes')
		description += ' · ' + formatBytes(activation.current_bytes);
	else if (activation.reason === 'leg0_queue')
		description += ' · ' + formatBytes(activation.backlog_bytes);
	return description;
}

function renderAggregate(node, stale) {
	const logical = node.logical || {},
	      current = logical.current || {},
	      peak = logical.peak || {},
	      cumulative = logical.cumulative || {},
	      parameters = node.parameters || {},
	      memory = node.memory || {},
	      localSender = logical.local_sender || {},
	      remoteSender = logical.remote_sender || {};
	return E('section', { 'class': 'mp-panel mp-aggregate' }, [
		E('div', { 'class': 'mp-panel-header' }, [
			E('div', {}, [
				E('h3', {}, [ displayTag(node.tag) ]),
				E('div', { 'class': 'mp-panel-subtitle' }, [ node.aggregation_server || '-' ])
			]),
			renderState(logical.state, stale)
		]),
		E('div', { 'class': 'mp-metrics' }, [
			renderMetric(_('TCP connections'), String(number(logical.connections))),
			renderMetric(_('Download'), formatRate(current.rx_bytes_per_second), 'mp-rx'),
			renderMetric(_('Upload'), formatRate(current.tx_bytes_per_second), 'mp-tx'),
			renderMetric(_('Cumulative traffic'), formatBytes(number(cumulative.rx_bytes) + number(cumulative.tx_bytes)))
		]),
		renderCollapsible('aggregate:' + node.tag + ':traffic', _('Traffic'), [
			E('div', { 'class': 'mp-traffic-row' }, [
				E('span', {}, [ _('Current') ]),
				E('strong', { 'class': 'mp-rx' }, [ _('RX %s').format(formatRate(current.rx_bytes_per_second)) ]),
				E('strong', { 'class': 'mp-tx' }, [ _('TX %s').format(formatRate(current.tx_bytes_per_second)) ])
			]),
			E('div', { 'class': 'mp-traffic-row' }, [
				E('span', {}, [ _('Since process start') ]),
				E('strong', { 'class': 'mp-rx' }, [ _('RX %s').format(formatBytes(cumulative.rx_bytes)) ]),
				E('strong', { 'class': 'mp-tx' }, [ _('TX %s').format(formatBytes(cumulative.tx_bytes)) ])
			]),
			E('div', { 'class': 'mp-traffic-row' }, [
				E('span', {}, [ _('Peak 1-second average') ]),
				E('strong', { 'class': 'mp-rx', 'title': peak.rx_at ? formatTime(peak.rx_at) : '-' }, [ _('RX %s').format(formatRate(peak.rx_bytes_per_second)) ]),
				E('strong', { 'class': 'mp-tx', 'title': peak.tx_at ? formatTime(peak.tx_at) : '-' }, [ _('TX %s').format(formatRate(peak.tx_bytes_per_second)) ])
			])
		]),
		renderCollapsible('aggregate:' + node.tag + ':state', _('Aggregation state'), [
			E('div', { 'class': 'mp-mode-row' }, [
				E('span', {}, [ _('Preferred only'), E('strong', {}, [ String(number(logical.preferred_only_connections)) ]) ]),
				E('span', {}, [ _('TX aggregating'), E('strong', {}, [ String(number(logical.tx_aggregating_connections)) ]) ]),
				E('span', {}, [ _('RX aggregation observed'), E('strong', {}, [ String(number(logical.rx_aggregating_connections)) ]) ]),
				E('span', {}, [ _('Booster degraded'), E('strong', {}, [ String(number(logical.booster_degraded_connections)) ]) ])
			])
		]),
		renderCollapsible('aggregate:' + node.tag + ':parameters', _('Effective multipath parameters'), [
			renderParameters([
				[ _('Aggregation server'), node.aggregation_server || '-', 'Remote multipath inbound used to join both child legs.' ],
				[ _('UDP outbound'), displayTag(node.udp_outbound), 'Child outbound selected for UDP. UDP uses this one child and is not aggregated.' ],
				[ _('TCP Fast Open'), node.tcp_fast_open ? _('Enabled') : _('Disabled'), 'Whether multipath connection setup can send early data. The child path must also support TCP Fast Open.' ],
				[ _('Local TX aggregation'), parameters.aggregation_enabled !== false ? _('Enabled') : _('Disabled'), _('Controls client upload only. When enabled, any enabled queue, rate, or byte-count trigger activates aggregation (OR). When disabled, upload data always uses the preferred leg; server downlink and UDP are unchanged.') ],
				[ _('Activate on preferred queue'), parameters.activation_on_queue !== false ? _('Enabled') : _('Disabled'), _('Independent OR trigger: activate when the preferred send queue stays at least 80% full for the activation window. All triggers disabled means preferred-only TX.') ],
				[ _('Activation threshold'), parameters.activation_threshold_mbps ? parameters.activation_threshold_mbps + ' Mbps' : _('Disabled'), _('Independent OR trigger: average local TX rate per connection, in Mbps. 0 disables this trigger. If empty, sing-box uses 150 unless a non-zero byte-count trigger is configured.') ],
				[ _('Activation after bytes'), parameters.activation_after_bytes ? formatBytes(parameters.activation_after_bytes) : _('Disabled'), _('Independent OR trigger: cumulative locally sent bytes per connection. 0 disables this trigger.') ],
				[ _('Minimum rate after bytes'), parameters.activation_after_bytes_min_mbps ? parameters.activation_after_bytes_min_mbps + ' Mbps' : _('Disabled'), _('Only the byte-count trigger requires this minimum average rate over a complete activation window, in Mbps. 0 or empty removes the rate gate; queue and rate triggers remain independent.') ],
				[ _('Activation window'), formatDuration(parameters.activation_window_ms), 'Sampling window used by rate and sustained leg 0 queue activation checks.' ],
				[ _('Chunk size'), formatBytes(parameters.chunk_size), 'Maximum payload carried by one multipath data frame.' ],
				[ _('Queue'), '%d frames · %s'.format(number(parameters.queue_frames), formatBytes(parameters.queue_bytes)), 'Per-leg send queue capacity: frame slots · bytes. It absorbs bursts but uses memory and may add queueing delay.' ],
				[ _('Maximum reorder buffer'), '%d frames · %s'.format(number(parameters.max_reorder_frames), formatBytes(parameters.max_reorder_bytes)), 'Out-of-order receive buffer limit: frame slots · bytes. It bounds memory while waiting for an earlier frame.' ],
				[ _('Booster replay'), '%s · %s'.format(formatBytes(parameters.leg1_replay_bytes), formatDuration(parameters.leg1_replay_timeout_ms)), 'Leg 1 replay retention: bytes · timeout. Unacknowledged leg 1 data is retained for fallback to leg 0.' ],
				[ _('Handshake timeout'), formatDuration(parameters.handshake_timeout_ms), 'Maximum time allowed for a multipath leg handshake.' ],
				[ _('Last activation'), activationDescription(logical.last_activation), 'Most recent reason leg 1 was activated, with the observed trigger value when available.' ]
			])
		]),
		renderCollapsible('aggregate:' + node.tag + ':buffers', _('Live buffers'), [
			renderParameters([
				[ _('Sender replay'), '%s %s (%s %s) · %s %s (%s %s)'.format(
					_('Upload'), formatBytes(localSender.replay_bytes), _('peak'), formatBytes(localSender.replay_peak_bytes),
					_('Download'), remoteSender.available ? formatBytes(remoteSender.replay_bytes) : '-', _('peak'), remoteSender.available ? formatBytes(remoteSender.replay_peak_bytes) : '-'), 'Each direction: current replay bytes (peak replay bytes). Download is reported by the remote sender.' ],
				[ _('Fallback recovery'), '%s %s / %s / %d / %d · %s %s / %s / %d / %d'.format(
					_('Upload'), formatBytes(localSender.fallback_bytes), formatPercent(localSender.fallback_bytes, localSender.leg1_tx_bytes), number(localSender.fallback_frames), number(localSender.replay_timeouts),
					_('Download'), remoteSender.available ? formatBytes(remoteSender.fallback_bytes) : '-', formatPercent(remoteSender.fallback_bytes, remoteSender.leg1_tx_bytes), number(remoteSender.fallback_frames), number(remoteSender.replay_timeouts)), 'Each direction: fallback bytes / share of leg 1 traffic / recovered frames / replay timeouts. Fallback bytes were reassigned from leg 1 to leg 0.' ],
				[ _('Sender backpressure'), '%s %d / %s · %s %d / %s'.format(
					_('Upload'), number(localSender.backpressure_events), formatDuration(localSender.backpressure_duration_ms),
					_('Download'), number(remoteSender.backpressure_events), formatDuration(remoteSender.backpressure_duration_ms)), 'Each direction: backpressure event count / total blocked time. It indicates throttling by bounded queues or the memory budget.' ],
				[ _('Reorder buffer'), '%s / %d (%s %s / %d)'.format(
					formatBytes(logical.reorder_bytes), number(logical.reorder_frames), _('peak'), formatBytes(logical.reorder_peak_bytes), number(logical.reorder_peak_frames)), 'Current logical receive reorder buffer: bytes / frames (peak bytes / frames).' ],
				[ _('Memory usage'), '%s %s / %s / %s · %s %s / %s'.format(
					_('Local'), formatBytes(memory.used_bytes), formatBytes(memory.peak_used_bytes), formatBytes(memory.limit_bytes),
					_('Remote'), remoteSender.available ? formatBytes(remoteSender.memory_used_bytes) : '-', remoteSender.available ? formatBytes(remoteSender.memory_peak_used_bytes) : '-'), 'Local current / peak / limit memory, followed by remote current / peak memory. Remote values come from server telemetry.' ],
				[ _('Memory pressure'), '%s %s / %d / %d · %s %s / %d / %d'.format(
					_('Local'), memory.pressure ? _('Active') : _('Normal'), number(memory.pressure_events), number(memory.backpressure_events),
					_('Remote'), remoteSender.memory_pressure ? _('Active') : _('Normal'), number(remoteSender.memory_pressure_events), number(remoteSender.memory_backpressure_events)), 'Each side: pressure state / pressure event count / memory backpressure event count.' ],
				[ _('Remote sender status'), !remoteSender.available ? _('Unavailable') :
					(remoteSender.stale ? _('Stale') : _('Fresh')) + (remoteSender.updated_at ? ' · ' + formatTime(remoteSender.updated_at) : ''), 'Remote sender telemetry state: unavailable, stale, or fresh. The timestamp is the last received update.' ],
				[ _('Connections since start'), String(number(logical.connections_total)), 'Total logical TCP connections created since this sing-box process started.' ]
			])
		])
	]);
}

function renderFlows(flows) {
	flows = Array.isArray(flows) ? flows : [];
	const rows = flows.map((flow) => {
		const current = flow.current || {}, cumulative = flow.cumulative || {};
		return E('tr', {}, [
			E('td', { 'title': '%s · #%s'.format(flow.destination || '-', flow.session_id || '-') }, [ flow.destination || '-' ]),
			E('td', {}, [ '#' + (flow.session_id || '-') ]),
			E('td', {}, [ formatAge(flow.age_seconds) ]),
			E('td', { 'class': 'mp-rx' }, [ formatRate(current.rx_bytes_per_second) ]),
			E('td', { 'class': 'mp-tx' }, [ formatRate(current.tx_bytes_per_second) ]),
			E('td', {}, [ formatBytes(number(cumulative.rx_bytes) + number(cumulative.tx_bytes)) ])
		]);
	});
	if (!rows.length)
		rows.push(E('tr', {}, E('td', { 'class': 'mp-flow-empty', 'colspan': 6 }, [ _('No active flows in the latest sample.') ])));
	return E('div', { 'class': 'mp-table-wrap' }, E('table', { 'class': 'mp-flow-table' }, [
		E('thead', {}, E('tr', {}, [
			E('th', {}, [ _('Destination') ]),
			E('th', {}, [ _('Session') ]),
			E('th', {}, [ _('Age') ]),
			E('th', {}, [ _('Download') ]),
			E('th', {}, [ _('Upload') ]),
			E('th', {}, [ _('Total') ])
		])),
		E('tbody', {}, rows)
	]));
}

function renderLeg(nodeTag, leg, stale) {
	const current = leg.current || {}, cumulative = leg.cumulative || {}, frames = leg.frames || {},
	      peak = leg.peak || {},
	      udpCurrent = leg.udp_current || {}, udpCumulative = leg.udp_cumulative || {},
	      queueCapacity = number(leg.connections) * number(leg.queue_bytes_per_connection),
	      queueRatio = queueCapacity ? Math.min(100, number(leg.backlog_bytes) * 100 / queueCapacity) : 0,
	      bandwidth = number(leg.configured_bandwidth_mbps),
	      title = leg.id === 0 ? _('leg0 · Preferred') : _('leg1 · Booster'),
	      parameterEntries = [
			[ _('Local TX policy'), '%s · %s · %s %d'.format(
				bandwidth ? bandwidth + ' Mbps' : _('Automatic'), number(leg.tx_share_percent).toFixed(1) + '%', _('weight'), number(leg.tx_weight)), _('Configured bandwidth hint · normalized weight share · scheduler weight. These guide local TX scheduling; the percentage is not measured traffic share and none of these values imposes a rate limit.') ],
			[ _('Queue backlog'), '%s %s / %s (%s %s) · %s %s (%s %s)'.format(
				_('Upload'), formatBytes(leg.backlog_bytes), formatBytes(queueCapacity), _('peak'), formatBytes(leg.peak_backlog_bytes),
				_('Download'), formatBytes(leg.remote_backlog_bytes), _('peak'), formatBytes(leg.remote_peak_backlog_bytes)), _('Upload: current backlog / queue capacity (peak backlog). Download: remote current backlog (peak backlog); remote capacity is not shown.') ],
			[ _('Writer state'), '%s %s / %s · %s %s / %s'.format(
				_('Upload'), formatBytes(leg.writing_bytes), formatDuration(leg.write_blocked_ms),
				_('Download'), formatBytes(leg.remote_writing_bytes), formatDuration(leg.remote_write_blocked_ms)), 'Each direction: bytes currently held by the writer / time blocked on writing. Download is reported by the remote sender.' ],
			[ _('Frames'), _('TX %d · RX %d').format(number(frames.tx), number(frames.rx)), 'Frames sent on this leg · frames received on this leg.' ],
			[ _('Leg lifecycle'), '%s %d · %s %d · %s %d'.format(
				_('joins'), number(leg.join_count), _('attempts'), number(leg.attempt_count), _('remote failures'), number(leg.remote_failure_count)), 'Successful leg joins · connection attempts · failures reported by the remote side.' ],
			[ _('Peak 1-second speed'), '%s · %s'.format(
				_('RX %s').format(formatRate(peak.rx_bytes_per_second)), _('TX %s').format(formatRate(peak.tx_bytes_per_second))), 'Peak one-second average speed since process start: received rate · transmitted rate.' ],
			[ _('Effective RTT'), '%s %s · %s %s · %s %s · %s %s–%s · %s %s'.format(
				_('latest'), formatLatency(leg.rtt_latest_ms), _('average'), formatLatency(leg.rtt_average_ms), _('EWMA'), formatLatency(leg.rtt_ewma_ms),
				_('range'), formatLatency(leg.rtt_min_ms), formatLatency(leg.rtt_max_ms), _('jitter'), formatLatency(leg.rtt_jitter_ms)), 'Multipath probe RTT in milliseconds: latest · average · EWMA · minimum-maximum range · jitter. It includes transport and proxy queueing.' ],
			[ _('Probe health'), '%s %d · %s %d · %s'.format(
				_('sent'), number(leg.probe_sent), _('timeouts'), number(leg.probe_timeout), formatPercent(leg.probe_timeout, leg.probe_sent)), 'Probe packets sent · probe timeouts · timeout ratio. This is multipath probe health, not raw IP packet loss.' ]
	      ];
	if (leg.remote_last_failure_stage)
		parameterEntries.push([ _('Last remote failure stage'), legEventStageLabel(leg.remote_last_failure_stage), 'Most recent stage at which the remote side reported a failure for this leg.' ]);
	if (leg.udp_selected) {
		parameterEntries.push(
			[ _('UDP traffic'), '%s · %s · %s · %s'.format(
				_('RX %s').format(formatRate(udpCurrent.rx_bytes_per_second)),
				_('TX %s').format(formatRate(udpCurrent.tx_bytes_per_second)),
				_('RX %s').format(formatBytes(udpCumulative.rx_bytes)),
				_('TX %s').format(formatBytes(udpCumulative.tx_bytes))), 'UDP current RX rate · current TX rate · cumulative RX bytes · cumulative TX bytes. UDP uses the selected child only.' ]
		);
	}
	return E('section', { 'class': 'mp-panel mp-leg' + leg.id }, [
		E('div', { 'class': 'mp-panel-header' }, [
			E('div', {}, [
				E('h3', {}, [ title ]),
				E('div', { 'class': 'mp-panel-subtitle' }, [ '%s · %s'.format(displayTag(leg.tag), leg.type || '-') ])
			]),
			renderState(leg.state, stale)
		]),
		E('div', { 'class': 'mp-metrics' }, [
			renderMetric(_('Connections'), String(number(leg.connections))),
			renderMetric(_('Download'), formatRate(current.rx_bytes_per_second), 'mp-rx'),
			renderMetric(_('Upload'), formatRate(current.tx_bytes_per_second), 'mp-tx'),
			renderMetric(_('Cumulative traffic'), formatBytes(number(cumulative.rx_bytes) + number(cumulative.tx_bytes)))
		]),
		E('div', { 'class': 'mp-traffic-row' }, [
			E('span', { 'title': _('Traffic on this leg since process start, including TCP payload and UDP when this child is selected for UDP. Download is RX; upload is TX. Protocol overhead is excluded.') }, [ _('Cumulative traffic') ]),
			E('strong', { 'class': 'mp-rx' }, [ _('Download') + ' ' + formatBytes(cumulative.rx_bytes) ]),
			E('strong', { 'class': 'mp-tx' }, [ _('Upload') + ' ' + formatBytes(cumulative.tx_bytes) ])
		]),
		E('div', { 'class': 'mp-mode-row' }, [
			E('span', {}, [ _('Carrying'), E('strong', {}, [ String(number(leg.carrying_connections)) ]) ]),
			E('span', {}, [ _('Standby'), E('strong', {}, [ String(number(leg.standby_connections)) ]) ]),
			E('span', {}, [ _('Connecting'), E('strong', {}, [ String(number(leg.connecting_connections)) ]) ]),
			E('span', {}, [ _('Retrying'), E('strong', {}, [ String(number(leg.retrying_connections)) ]) ])
		]),
		renderCollapsible('leg:' + leg.id + ':' + leg.tag + ':parameters', _('Leg parameters and counters'), [
			renderParameters(parameterEntries),
			E('div', { 'class': 'mp-meter', 'title': _('Queue utilization: %s').format(queueRatio.toFixed(1) + '%') },
				E('span', { 'style': 'width:' + queueRatio.toFixed(1) + '%' })),
			renderLegEvent(nodeTag, leg)
		]),
		renderCollapsible('leg:' + leg.id + ':' + leg.tag + ':flows', _('Top 10 flows by current speed'), [
			renderFlows(leg.top_flows)
		])
	]);
}

function lineStrength(rate) {
	rate = number(rate);
	return Math.max(2, Math.min(7, 2 + Math.log10(rate + 1) * .72));
}

function renderConnector(leg) {
	const current = leg.current || {}, tx = number(current.tx_bytes_per_second), rx = number(current.rx_bytes_per_second);
	return E('div', { 'class': 'mp-connector mp-link' + leg.id }, [
		E('div', { 'class': 'mp-link-label' }, [
			E('span', { 'class': 'mp-tx' }, [ _('TX %s').format(formatRate(tx)) ]),
			E('span', { 'class': 'mp-rx' }, [ _('RX %s').format(formatRate(rx)) ])
		]),
		E('div', {
			'class': 'mp-link-lane mp-link-tx',
			'style': '--lane-size:%spx;--lane-opacity:%s'.format(lineStrength(tx).toFixed(1), tx ? '.95' : '.25')
		}),
		E('div', {
			'class': 'mp-link-lane mp-link-rx',
			'style': '--lane-size:%spx;--lane-opacity:%s'.format(lineStrength(rx).toFixed(1), rx ? '.95' : '.25')
		})
	]);
}

function normalizeDocuments(result) {
	const documents = Array.isArray(result?.nodes) ? result.nodes : [];
	return documents.filter((document) => document?.schema_version === 2 && document?.node)
		.sort((left, right) => String(left.node.tag).localeCompare(String(right.node.tag)));
}

return view.extend({
	selectedTag: null,
	root: null,
	result: null,
	error: null,

	load() {
		return L.resolveDefault(callMultipathStatus(), { nodes: [] });
	},

	render(result) {
		this.result = result;
		this.root = E('div', { 'class': 'mp-page' });
		this.renderStatus();
		poll.add(() => callMultipathStatus().then((next) => {
			this.result = next;
			this.error = null;
			this.renderStatus();
		}).catch((err) => {
			this.error = err;
			this.renderStatus();
		}), 1);
		return E([ E('style', [ css ]), this.root ]);
	},

	renderStatus() {
		const documents = normalizeDocuments(this.result);
		if (!documents.some((document) => document.node.tag === this.selectedTag))
			this.selectedTag = documents[0]?.node?.tag || null;
		const selected = documents.find((document) => document.node.tag === this.selectedTag),
		      generated = selected ? new Date(selected.generated_at).getTime() : 0,
		      stale = !!selected && (!generated || Date.now() - generated > 3000),
		      content = [];

		content.push(E('div', { 'class': 'mp-toolbar' }, [
			E('div', {}, [
				E('h2', {}, [ _('Multipath Status') ]),
				E('div', { 'class': 'mp-toolbar-meta' }, [
					selected ? _('Updated %s · process started %s').format(formatTime(selected.generated_at), formatTime(selected.process_started_at)) : _('Waiting for sing-box status data.')
				])
			]),
			documents.length ? E('div', { 'class': 'mp-selector' }, [
				E('label', { 'for': 'mp-node-selector' }, [ _('Multipath outbound') ]),
				E('select', {
					'id': 'mp-node-selector',
					'change': (event) => {
						this.selectedTag = event.target.value;
						this.renderStatus();
					}
				}, documents.map((document) => E('option', {
					'value': document.node.tag,
					'selected': document.node.tag === this.selectedTag ? '' : null
				}, [ displayTag(document.node.tag) ])))
			]) : ''
		]));

		if (this.error)
			content.push(E('div', { 'class': 'mp-notice' }, [ _('Failed to read multipath status: %s').format(this.error) ]));
		else if (stale)
			content.push(E('div', { 'class': 'mp-notice' }, [ _('Multipath status data is stale.') ]));

		if (!selected) {
			content.push(E('div', { 'class': 'mp-empty' }, [ _('No multipath status data is available.') ]));
		} else {
			const node = selected.node,
			      legs = Array.isArray(node.legs) ? node.legs : [],
			      leg0 = legs.find((leg) => leg.id === 0) || { id: 0 },
			      leg1 = legs.find((leg) => leg.id === 1) || { id: 1 };
			content.push(E('div', { 'class': 'mp-topology' }, [
				renderAggregate(node, stale),
				renderConnector(leg0),
				renderLeg(node.tag, leg0, stale),
				renderConnector(leg1),
				renderLeg(node.tag, leg1, stale)
			]));
		}

		dom.content(this.root, content);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
