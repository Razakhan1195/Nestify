# Independent release monitoring

Prepared for a separately hosted Linux machine with systemd and Node 24 or later. This package is not installed or sending alerts until an owner chooses the host and receiver. Running on a laptop or the application host does not provide independent, always-on monitoring.

1. Install the reviewed `scripts/monitor-release.mjs` at `/opt/rezlee/scripts/monitor-release.mjs`, readable by the service. Confirm `/usr/bin/node --version` is 24 or later; adjust the unit's absolute executable if needed.
2. Create `/etc/rezlee/monitor.env`, root-owned mode 0600, with `REZLEE_MONITOR_URL=https://<approved-app-host>/api/ops/health`, the matching `REZLEE_MONITOR_TOKEN`, and an approved HTTPS `REZLEE_ALERT_WEBHOOK_URL` accepting a JSON `text` field. Do not put secrets in git or shell history. The token must have at least 32 characters. The state directory is created privately by systemd on local disk.
3. Install these units under `/etc/systemd/system/`. Run `systemd-analyze verify` for both files, `systemctl daemon-reload`, then a one-shot `systemctl start rezlee-monitor.service`. Check the private service journal for the fixed health result. A healthy first check sends no message.
4. With the designated recipient's authorization, rehearse three consecutive failures and recovery against an isolated health fixture. Confirm both events arrive and the receiver's rejected requests are retried. Do not take the live app down to test alerts. Verify an overlapping check skips, and a forcibly terminated checker releases its lock.
5. Enable `rezlee-monitor.timer` with `systemctl enable --now rezlee-monitor.timer`. Confirm the next run with `systemctl list-timers`. Assign an incident owner and backup, and define response coverage before launch.

State and SQLite lease files contain no customer content. The SQLite lock automatically releases after process death. Alert delivery failure preserves the previous incident state so the transition is retried. Three failures trigger an incident; one successful check triggers recovery. Only fixed operational text is sent, never a raw API response, exception or customer record. Budget exhaustion and unavailable service signals remain visible in the operations console.

This monitor cannot report its own machine losing power. The selected hosting service must also supervise the timer or provide a separate dead-man heartbeat before production sign-off. Provider account quotas, billing approvals, an alert recipient and actual event receipt remain operational acceptance, not something this package proves.
