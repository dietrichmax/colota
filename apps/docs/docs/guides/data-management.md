---
sidebar_position: 3
---

# Data Management

Manage your location database from the Data Management screen.

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/DataManagement.png", label: "Data Management" }, ]} />

## Actions

| Action                       | Description                                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| **Sync Now**                 | Manually flush the queue and upload pending locations                      |
| **Clear Sent History**       | Remove locations that have already been synced                             |
| **Clear Queue**              | Remove unsent locations from the upload queue                              |
| **Delete Older Than X Days** | Clean up old data past a specified age                                     |
| **Vacuum Database**          | Reclaim disk space after deletions                                         |
| **Export Locations**         | Export location history - see [Data Export](data-export.md)                |
| **Import Locations**         | Merge external files into your history - see [Data Import](data-import.md) |

In [offline mode](/docs/configuration/server-settings#offline-mode), sync-related actions (Sync Now, Clear Sent History, Clear Queue) are hidden since no queue is used. A **Delete All Locations** action is available instead. Data export remains fully available - see [Data Export](data-export.md).

For a full archive of locations, settings and credentials in a single password-encrypted file, use **Settings → Backup & Restore** - see [Backup & Restore](backup-restore.md).

## Imported locations and the queue

Locations brought in via [Data Import](data-import.md) are marked as already synced by default, so they **do not show up in the queue counter** and don't get re-uploaded to your backend. If you used the **Import + Queue for Sync** button on the import dialog instead (the "migration" path), the imported rows do land in the queue and the next sync drains them - the counters here will reflect that until they finish uploading.

## Storage Reference

- ~200 bytes per location
- ~2 MB per 10,000 locations
