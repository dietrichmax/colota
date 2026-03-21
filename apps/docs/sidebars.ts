import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "doc",
      id: "introduction",
      label: "Introduction"
    },
    {
      type: "category",
      label: "Getting Started",
      items: ["getting-started/installation", "getting-started/quick-start", "getting-started/build-from-source"]
    },
    {
      type: "category",
      label: "Configuration",
      items: [
        "configuration/sync-presets",
        "configuration/gps-settings",
        "configuration/server-settings",
        "configuration/field-mapping",
        "configuration/authentication"
      ]
    },
    {
      type: "category",
      label: "Integrations",
      items: [
        "integrations/overview",
        "integrations/api-templates",
        "integrations/dawarich",
        "integrations/home-assistant",
        "integrations/owntracks",
        "integrations/geopulse",
        "integrations/reitti",
        "integrations/phonetrack",
        "integrations/traccar",
        "integrations/custom-backend"
      ]
    },
    {
      type: "category",
      label: "Guides",
      items: [
        "guides/geofencing",
        "guides/tracking-profiles",
        "guides/app-shortcuts",
        "guides/data-export",
        "guides/data-management",
        "guides/deep-link-setup",
        "guides/battery-optimization",
        "guides/offline-maps",
        "guides/tile-server",
        "guides/troubleshooting"
      ]
    },
    {
      type: "doc",
      id: "alternatives",
      label: "Alternatives"
    },
    {
      type: "category",
      label: "Development",
      items: ["development/architecture", "development/local-setup", "development/permissions"]
    },
    {
      type: "doc",
      id: "api-reference",
      label: "API Reference"
    },
    {
      type: "doc",
      id: "faq",
      label: "FAQ"
    },
    {
      type: "doc",
      id: "contributing",
      label: "Contributing"
    }
  ]
}

export default sidebars
