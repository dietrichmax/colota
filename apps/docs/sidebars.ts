import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "category",
      label: "Getting started",
      items: ["introduction", "getting-started/installation", "getting-started/quick-start"]
    },
    {
      type: "category",
      label: "Tracking",
      items: [
        "configuration/tracking-sync",
        "guides/tracking-profiles",
        "guides/geofencing",
        "guides/automation",
        "guides/battery-optimization"
      ]
    },
    {
      type: "category",
      label: "Connection",
      items: [
        "configuration/connection",
        "configuration/request-format",
        "configuration/authentication",
        "configuration/mtls"
      ]
    },
    {
      type: "category",
      label: "Integrations",
      items: [
        "integrations/overview",
        "integrations/dawarich",
        "integrations/geopulse",
        "integrations/home-assistant",
        "integrations/overland",
        "integrations/owntracks",
        "integrations/phonetrack",
        "integrations/reitti",
        "integrations/traccar",
        "integrations/custom-backend"
      ]
    },
    {
      type: "category",
      label: "History and data",
      items: [
        "guides/location-history",
        "guides/editing-trips",
        "guides/data-export",
        "guides/data-import",
        "guides/data-management",
        "guides/backup-restore",
        "guides/deep-link-setup"
      ]
    },
    {
      type: "category",
      label: "Display",
      items: ["configuration/appearance", "guides/offline-maps", "guides/tile-server"]
    },
    {
      type: "category",
      label: "Help",
      items: ["guides/troubleshooting", "faq"]
    },
    {
      type: "category",
      label: "Reference",
      items: ["api-reference", "development/permissions", "security", "alternatives"]
    },
    {
      type: "category",
      label: "Development",
      items: [
        "development/architecture",
        "development/local-setup",
        "getting-started/build-from-source",
        "development/translations",
        "contributing"
      ]
    }
  ]
}

export default sidebars
