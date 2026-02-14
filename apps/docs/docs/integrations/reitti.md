---
sidebar_position: 4
---

# Reitti

[Reitti](https://github.com/Moo-Ack-Productions/reitti) is a self-hosted location tracking service.

## Setup

1. **Install Reitti** -- follow the [Reitti documentation](https://github.com/Moo-Ack-Productions/reitti)
2. **Configure Colota**:
   - Go to **Settings > API Settings**
   - Select the **Reitti** template
   - Set your endpoint URL, e.g. `https://reitti.yourdomain.com/api/location`

## Payload Format

The Reitti template auto-configures the following payload:

```json
{
  "_type": "location",
  "lat": 51.495065,
  "lon": -0.043945,
  "acc": 12,
  "alt": 519,
  "vel": 0,
  "batt": 85,
  "bs": 2,
  "tst": 1704067200,
  "bear": 180.5
}
```

Reitti uses standard field names including `bear` for bearing.
