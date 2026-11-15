import { themes as prismThemes } from "prism-react-renderer"
import type { Config } from "@docusaurus/types"
import type * as Preset from "@docusaurus/preset-classic"
import {
  DISCUSSIONS_URL,
  FDROID_URL,
  GITHUB_RELEASES_URL,
  ISSUES_URL,
  IZZYONDROID_URL,
  PLAY_STORE_WEB_URL,
  REPO_URL,
  SUPPORT_URL
} from "@colota/shared"
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

  headTags: [
    {
      tagName: "link",
      attributes: {
        rel: "alternate",
        type: "application/rss+xml",
        title: "Colota Releases",
        href: "https://colota.app/releases.xml"
      }
    }
  ],

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
          editUrl: `${REPO_URL}/tree/main/apps/docs/`
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css"
        }
      } satisfies Preset.Options
    ]
  ],

  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      {
        redirects: [
          { from: "/docs/guides/app-shortcuts", to: "/docs/guides/automation" },
          { from: "/docs/configuration/gps-settings", to: "/docs/configuration/tracking-settings" },
          // Short, shareable install URL. The docs page is the single source for install channels.
          { from: "/download", to: "/docs/getting-started/installation" }
        ]
      }
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
          to: "/releases",
          label: "Releases",
          position: "left"
        },
        {
          to: "/privacy-policy",
          label: "Privacy Policy",
          position: "left"
        },
        {
          href: REPO_URL,
          label: "GitHub",
          position: "right"
        }
      ]
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Download",
          items: [
            {
              label: "Google Play",
              href: PLAY_STORE_WEB_URL
            },
            {
              label: "F-Droid",
              href: FDROID_URL
            },
            {
              label: "IzzyOnDroid",
              href: IZZYONDROID_URL
            }
          ]
        },
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
              href: REPO_URL
            },
            {
              label: "Issues",
              href: ISSUES_URL
            },
            {
              label: "Discussions",
              href: DISCUSSIONS_URL
            },
            {
              label: "GitHub Releases",
              href: GITHUB_RELEASES_URL
            }
          ]
        },
        {
          title: "Support",
          items: [
            {
              label: "Donate",
              href: SUPPORT_URL
            }
          ]
        }
      ],
      copyright: `Copyright © ${new Date().getFullYear()} <a href="https://mxd.codes">Max Dietrich</a> and contributors. Licensed under AGPL-3.0. <a href="/privacy-policy">Privacy Policy</a>`
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json"]
    }
  } satisfies Preset.ThemeConfig
}

export default config
