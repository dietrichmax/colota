import { registerModalHandler, showPrompt, type ModalRequest } from "../modalService"

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
