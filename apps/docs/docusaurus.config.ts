import { themes as prismThemes } from "prism-react-renderer"
import type { Config } from "@docusaurus/types"
import type * as Preset from "@docusaurus/preset-classic"
const config: Config = {
  title: "Colota",
  tagline: "Self-hosted GPS tracking for Android",
  favicon: "img/favicon.png",

  future: {
    v4: true
  },

  url: "https://colota.app",
  baseUrl: "/",

  organizationName: "dietrichmax",
  projectName: "colota",

  onBrokenLinks: "throw",

  staticDirectories: ["static", "../../packages/shared"],

  i18n: {
    defaultLocale: "en",
    locales: ["en"]
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/dietrichmax/colota/tree/main/apps/docs/"
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css"
        }
      } satisfies Preset.Options
    ]
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true
    },
    navbar: {
      title: "Colota",
      logo: {
        alt: "Colota",
        src: "img/app-icon.png"
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs"
        },
        {
          to: "/privacy-policy",
          label: "Privacy Policy",
          position: "left"
        },
        {
          href: "https://play.google.com/store/apps/details?id=com.Colota&hl=en-US",
          label: "Google Play",
          position: "right"
        },
        {
          href: "https://github.com/dietrichmax/colota",
          label: "GitHub",
          position: "right"
        }
      ]
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Getting Started",
              to: "/docs/getting-started/installation"
            },
            {
              label: "Configuration",
              to: "/docs/configuration/sync-presets"
            },
            {
              label: "Integrations",
              to: "/docs/integrations/api-templates"
            },
            {
              label: "Guides",
              to: "/docs/guides/geofencing"
            }
          ]
        },
        {
          title: "Project",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/dietrichmax/colota"
            },
            {
              label: "Issues",
              href: "https://github.com/dietrichmax/colota/issues"
            },
            {
              label: "Discussions",
              href: "https://github.com/dietrichmax/colota/discussions"
            }
          ]
        },
        {
          title: "Download",
          items: [
            {
              label: "Google Play",
              href: "https://play.google.com/store/apps/details?id=com.Colota&hl=en-US"
            },
            {
              label: "F-Droid",
              href: "https://f-droid.org/packages/com.Colota/"
            },
            {
              label: "Releases",
              href: "https://github.com/dietrichmax/colota/releases"
            }
          ]
        },
        {
          title: "Support",
          items: [
            {
              label: "GitHub Sponsors",
              href: "https://github.com/sponsors/dietrichmax"
            },
            {
              label: "Ko-fi",
              href: "https://ko-fi.com/maxdietrich"
            },
            {
              label: "Privacy Policy",
              to: "/privacy-policy"
            }
          ]
        }
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Max Dietrich. Licensed under AGPL-3.0.`
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json"]
    }
  } satisfies Preset.ThemeConfig
}

export default config
