---
title: "Install Colota"
description: "Free and open source. Needs Android 8.0 or newer."
layout: install
aliases:
  - /download/
  - /docs/getting-started/installation/
builds:
  - name: "Google Play build"
    tag: gms
    text: "Location from Google Play Services (FusedLocationProvider). Needs Play Services on the phone."
    channels:
      - { label: "Google Play", link: PLAY_STORE_WEB_URL, icon: package, sub: "play.google.com" }
      - { label: "GitHub Releases", link: GITHUB_RELEASES_URL, icon: code-xml, sub: "app-gms-release.apk" }
  - name: "FOSS build"
    tag: foss
    text: "No Google Play Services. Location from Android's own LocationManager: the platform's fused provider on Android 12 and newer (an AOSP API), raw GPS before that. The one for LineageOS, CalyxOS and other ROMs without Google services."
    channels:
      - { label: "F-Droid", link: FDROID_URL, icon: package, sub: "f-droid.org" }
      - {
          label: "IzzyOnDroid",
          link: IZZYONDROID_URL,
          icon: package,
          sub: "apt.izzysoft.de · usually gets new releases sooner than F-Droid"
        }
      - { label: "GitHub Releases", link: GITHUB_RELEASES_URL, icon: code-xml, sub: "app-foss-release.apk" }
after:
  - { label: "Quick Start", page: /docs/getting-started/quick-start, icon: arrow-right }
  - { labelKey: settings.whatsNew, page: /releases, icon: sparkles, sub: "Changes in every release" }
  - { label: "Build from Source", page: /docs/getting-started/build-from-source, icon: hammer }
---

> [!NOTE] GrapheneOS
>
> Either build works. Use the Google Play build with sandboxed Google Play, or the FOSS build from F-Droid, IzzyOnDroid or GitHub Releases. GrapheneOS reroutes location requests to its own reimplementation of the Play geolocation service, so you get the accuracy of FusedLocationProvider without sending location data to Google.

No Google services on the phone? Take the FOSS build. Otherwise either works, and the [FAQ](/docs/faq#which-variant-should-i-use---foss-or-google-play) compares them.

## Installing an APK

1. Download the latest APK from [GitHub Releases](https://github.com/dietrichmax/colota/releases): `app-gms-release.apk` for the Google Play build, `app-foss-release.apk` for the FOSS build
2. Enable **Install from Unknown Sources** in Android settings
3. Install the APK
