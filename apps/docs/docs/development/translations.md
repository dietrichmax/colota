---
sidebar_position: 4
---

# Translations

A translation can be partial: a line you leave out shows in English.

Colota's text lives in two files:

| File                                                      | Holds                                           |
| --------------------------------------------------------- | ----------------------------------------------- |
| `apps/mobile/src/i18n/locales/en.json`                    | The app's screens, dialogs and labels           |
| `apps/mobile/android/app/src/main/res/values/strings.xml` | Notifications, notification channels and toasts |

Error messages from the tracking service and every log line stay in English, so logs from any user read the same.

## Add a Language

1. Fork and clone [the repository](https://github.com/dietrichmax/colota).
2. Copy `en.json` to `<code>.json` in the same folder, where `<code>` is the two-letter language code, and translate the values. Keys stay as they are and in the same (alphabetical) order.
3. Copy `res/values/strings.xml` to `res/values-<code>/strings.xml` and translate it.
4. Optional: run `npx -w @colota/mobile jest src/i18n` after `npm ci` and `npm run build -w @colota/shared`. It checks that your file uses English keys only and keeps every placeholder; the pull request runs the same check.
5. Optional: to try the translation in the app, register the language:
   - In `apps/mobile/src/i18n/options.ts`, import your file, add the code to `SUPPORTED_LANGUAGES`, the language's own name to `LANGUAGE_NAMES` (`de: "Deutsch"`) and the file to `resources`.
   - In `apps/mobile/android/app/src/main/res/xml/locales_config.xml`, add `<locale android:name="<code>" />`. A test fails when this list and `SUPPORTED_LANGUAGES` disagree.
   - Build and install the app as in [Local Setup](./local-setup), then pick the language under **Settings → Appearance → Language**. A release build does not notice a changed `.json` file on its own: delete `apps/mobile/android/app/build/generated/assets/react` first.
6. Open a pull request. If you skipped step 5, the maintainer registers the language.

Regional variants such as `pt-BR`, right-to-left languages such as Arabic and languages with more than two plural forms such as Polish or Russian need changes in the app first. Open an issue before you start.

## Rules

- **Escaping in `strings.xml`**: write an apostrophe as `\'` and an ampersand as `&amp;`. Keep a percent sign and the tag attributes as the English has them.
- **Placeholders**: keep `{{name}}` in `en.json` and `%s`, `%d`, `%1$d` in `strings.xml` exactly as they are. Move them where your grammar needs them.
- **Plurals**: in `en.json` a key ending in `_one` is the singular and `_other` the plural. In `strings.xml` translate every `<item>` inside a `<plurals>` block.
- **Fragments**: a text that starts lowercase in English is part of a longer sentence. Translate it to fit mid-sentence.
- **Keep as is**: product and format names (Colota, GeoJSON, GPX, OwnTracks, Traccar), unit symbols and technical terms such as HTTPS or SSID.
- **Everyday words**: write what people say in your language, not a word-for-word translation. Where an English term is common in everyday use, such as Tracking or Upload in German, keep it.
- **Tone**: short and plain, like the English.
