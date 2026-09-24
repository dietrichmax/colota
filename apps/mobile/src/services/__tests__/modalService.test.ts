import i18next from "i18next"
import { registerModalHandler, showAlert, showConfirm, showPrompt, type ModalRequest } from "../modalService"

describe("showPrompt", () => {
  let last: ModalRequest | null = null

  beforeEach(() => {
    last = null
    registerModalHandler((request) => {
      last = request
    })
  })

  it("puts Cancel first and the confirm last, seeds the field and resolves the trimmed text on confirm", async () => {
    const answer = showPrompt({ title: "Note", initialValue: "Coffee", placeholder: "Add a note", multiline: true })

    expect(last!.buttons.map((b) => b.text)).toEqual(["Cancel", "Save"])
    expect(last!.input).toEqual({ placeholder: "Add a note", initialValue: "Coffee", multiline: true })
    last!.resolve(1, " Lunch ")
    await expect(answer).resolves.toBe("Lunch")
  })

  it("resolves null on Cancel and an empty string on a cleared field, which are different answers", async () => {
    const cancelled = showPrompt({ title: "Note" })
    last!.resolve(0, "typed anyway")
    await expect(cancelled).resolves.toBeNull()

    const cleared = showPrompt({ title: "Note" })
    last!.resolve(1, "   ")
    await expect(cleared).resolves.toBe("")
  })
})

describe("default button labels", () => {
  let last: ModalRequest | null = null

  beforeEach(() => {
    last = null
    registerModalHandler((request) => {
      last = request
    })
  })

  afterEach(async () => {
    await i18next.changeLanguage("en")
    i18next.removeResourceBundle("xx", "translation")
  })

  it("reads the catalog on each call, so a dialog opened after a language change is not left in English", async () => {
    i18next.addResourceBundle("xx", "translation", {
      "common.ok": "Gut",
      "common.cancel": "Zurück",
      "common.save": "Sichern"
    })
    await i18next.changeLanguage("xx")

    showAlert("Title", "Message")
    expect(last!.buttons.map((b) => b.text)).toEqual(["Gut"])
    showConfirm({ title: "Title", message: "Message" })
    expect(last!.buttons.map((b) => b.text)).toEqual(["Zurück", "Gut"])
    showPrompt({ title: "Title" })
    expect(last!.buttons.map((b) => b.text)).toEqual(["Zurück", "Sichern"])
  })

  it("keeps a caller's own labels over the defaults", () => {
    showConfirm({ title: "Title", message: "Message", confirmText: "Delete", cancelText: "Keep" })

    expect(last!.buttons.map((b) => b.text)).toEqual(["Keep", "Delete"])
  })
})
