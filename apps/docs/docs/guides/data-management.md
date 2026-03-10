---
sidebar_position: 3
---

# Data Management

Manage your location database from the Data Management screen.

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/DataManagement.png", label: "Data Management" }, ]} />

## Actions

| Action                       | Description                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| **Sync Now**                 | Manually flush the queue and upload pending locations       |
| **Clear Sent History**       | Remove locations that have already been synced              |
| **Clear Queue**              | Remove unsent locations from the upload queue               |
| **Delete Older Than X Days** | Clean up old data past a specified age                      |
| **Vacuum Database**          | Reclaim disk space after deletions                          |
| **Export Data**              | Export location history - see [Data Export](data-export.md) |

In [offline mode](/docs/configuration/server-settings#offline-mode), sync-related actions (Sync Now, Clear Sent History, Clear Queue) are hidden since no queue is used. A **Delete All Locations** action is available instead. Data export remains fully available - see [Data Export](data-export.md).

## Storage Reference

- ~200 bytes per location
- ~2 MB per 10,000 locations
