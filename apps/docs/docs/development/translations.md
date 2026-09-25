---
sidebar_position: 4
---

# Translations

You need a GitHub account and no coding. A translation can be partial: a line you leave out shows in English.

Colota's text lives in two files:

| File                                                      | Holds                                           |
| --------------------------------------------------------- | ----------------------------------------------- |
| `apps/mobile/src/i18n/locales/en.json`                    | The app's screens, dialogs and labels           |
| `apps/mobile/android/app/src/main/res/values/strings.xml` | Notifications, notification channels and toasts |

Error messages from the tracking service and every log line stay in English, so logs from any user read the same.

## Add a Language

1. Fork [the repository](https://github.com/dietrichmax/colota). Editing in GitHub's web editor is enough.
2. In your fork, open `apps/mobile/src/i18n/locales/en.json`, click **Raw** and copy everything. In the same folder choose **Add file → Create new file**, name it `<code>.json` and paste. `<code>` is the two-letter language code, such as `de` or `fr`.
3. Translate the text after each colon. Never change the text before it. Delete a line rather than leaving its text empty.
4. Do the same with `apps/mobile/android/app/src/main/res/values/strings.xml`: create the new file in `apps/mobile/android/app/src/main/res/` and name it `values-<code>/strings.xml`, which creates the folder too. Translate the text between the tags.
5. Open a pull request and name the language. The maintainer adds it to the app and attaches a test build to the pull request, so you can check your work on a phone under **Settings → Appearance → Language**.

Regional variants such as `pt-BR`, right-to-left languages such as Arabic and languages with more than two plural forms such as Polish or Russian need changes in the app first. Open an issue before you start.

## Keep the Files Valid

A broken file fails the automatic checks on the pull request, and the failing check names the line. On a first pull request the checks start once the maintainer approves them.

- **`<code>.json`**: keep the quotes around every text and the comma at the end of each line except the last. Write a quote inside a text as `\"`.
- **`strings.xml`**: write an apostrophe as `\'` and an ampersand as `&amp;`. Keep a percent sign and the tag's attributes exactly as the English has them.

## Rules

- **Placeholders**: keep `{{name}}` in `en.json` and `%s`, `%d`, `%1$d` in `strings.xml` exactly as they are. Move them where your grammar needs them.
- **Plurals**: in `en.json` a key ending in `_one` is the singular and `_other` the plural. In `strings.xml` translate every `<item>` inside a `<plurals>` block.
- **Fragments**: a text that starts lowercase in English is part of a longer sentence. Translate it to fit mid-sentence.
- **Keep as is**: product and format names (Colota, GeoJSON, GPX, OwnTracks, Traccar), unit symbols and technical terms such as HTTPS or SSID.
- **Everyday words**: write what people say in your language, not a word-for-word translation. Where an English term is common in everyday use, such as Tracking or Upload in German, keep it.
- **Tone**: short and plain, like the English.
