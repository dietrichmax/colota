---
name: "Forwarder: Bug Report"
about: Report a bug or unexpected behavior in colota-forwarder
title: ""
labels: bug, forwarder
assignees: ""
---

**Describe the bug** A clear description of what the bug is.

**Steps to reproduce** What the phone sent and where it should have gone.

**Expected behavior** What you expected the target to receive.

**Setup**

- Forwarder image tag: [e.g. v0.4.10 or latest]
- Endpoint the app posts to: [`/locations`, `/overland` or `/owntracks`]
- Target types involved: [e.g. owntracks, traccar]. Leave out URLs and keys.
- Colota app version, if the app sends the points: [as Settings > About prints it]

**Logs** The relevant forwarder log lines and the `delivery` block from `/health`, with URLs and keys removed.
