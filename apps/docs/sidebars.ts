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
        "integrations/api-templates",
        "integrations/dawarich",
        "integrations/owntracks",
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
        "guides/data-export",
        "guides/data-management",
        "guides/battery-optimization",
        "guides/troubleshooting"
      ]
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
