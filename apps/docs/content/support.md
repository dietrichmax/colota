---
title: "Support"
description: "Get help with Colota, or help the project."
layout: support
groups:
  - label: "Fix it yourself"
    rows:
      - { label: "Troubleshooting", page: /docs/guides/troubleshooting, icon: wrench }
      - { label: "FAQ", page: /docs/faq, icon: circle-question-mark }
      - {
          label: "Record a log",
          page: "/docs/guides/troubleshooting#viewing-and-exporting-logs",
          icon: scroll-text,
          sub: "What a bug report needs"
        }
      - {
          label: "Battery optimization",
          page: /docs/guides/battery-optimization,
          icon: battery-charging,
          sub: "Keep Android from stopping the tracker"
        }
  - label: "Ask"
    rows:
      - { label: "Ask a question", link: DISCUSSIONS_URL, icon: messages-square }
      - { label: "Report a bug", link: ISSUES_URL, icon: bug }
      - {
          label: "Report a vulnerability",
          link: SECURITY_REPORT_URL,
          icon: shield-alert,
          sub: "Privately, through GitHub"
        }
  - label: "Support development"
    rows:
      - { labelKey: settings.thanks, link: SUPPORT_URL, icon: heart }
      - { labelKey: settings.rate, link: PLAY_STORE_WEB_URL, icon: star, sub: "Google Play" }
      - { label: "Translate", page: /docs/development/translations, icon: languages }
      - { label: "Contribute", page: /docs/contributing, icon: git-pull-request }
---
