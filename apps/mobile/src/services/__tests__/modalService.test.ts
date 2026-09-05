import { registerModalHandler, showAlert, showChoice, showConfirm, type ModalRequest } from "../modalService"

describe("modalService", () => {
  let request: ModalRequest

  beforeEach(() => {
    registerModalHandler((next) => {
      request = next
    })
  })

  // The sheet stacks the buttons in the order it is given, so the order here is the order
  // the user sees: the action first, the way out last.
  it("puts the confirming action before the dismissive one", async () => {
    const answer = showConfirm({ title: "Delete trip", message: "Gone for good", confirmText: "Delete" })

    expect(request.buttons.map((button) => button.text)).toEqual(["Delete", "Cancel"])
    request.resolve(0)
    expect(await answer).toBe(true)
  })

  it("reads the second button as the cancel", async () => {
    const answer = showConfirm({ title: "Delete trip", message: "Gone for good", confirmText: "Delete" })

    request.resolve(1)

    expect(await answer).toBe(false)
  })

  // A confirm button labelled "OK" hides what it is about to do, so the caller has to name
  // the action. The type, not a runtime check, is what enforces it.
  it("requires the caller to name the confirming action", () => {
    // @ts-expect-error confirmText is required on showConfirm
    const withoutLabel = () => showConfirm({ title: "Delete trip", message: "Gone for good" })

    expect(typeof withoutLabel).toBe("function")
  })

  it("marks a destructive confirm so the sheet can paint it", () => {
    showConfirm({ title: "Delete all", message: "Gone for good", confirmText: "Delete", destructive: true })

    expect(request.buttons[0].style).toBe("destructive")
    expect(request.variant).toBe("error")
  })

  // showChoice callers read their answer back by index, so the array must reach the sheet
  // exactly as it was passed; only the sheet's own display order changes.
  it("passes a choice through in the caller's order", async () => {
    const choice = showChoice({
      title: "Import locations?",
      message: "4 new points",
      buttons: [
        { text: "Cancel", style: "secondary" },
        { text: "Import", style: "primary" }
      ]
    })

    expect(request.buttons.map((button) => button.text)).toEqual(["Cancel", "Import"])
    request.resolve(1)
    expect(await choice).toBe(1)
  })

  it("marks a choice the user has to answer as blocking", () => {
    showChoice({
      title: "Restart Colota",
      message: "The restore is finished.",
      blocking: true,
      buttons: [{ text: "Restart app", style: "primary" }]
    })

    expect(request.blocking).toBe(true)
  })

  it("leaves an ordinary alert dismissable", () => {
    showAlert("Export failed", "The folder is gone", "error")

    expect(request.blocking).toBeUndefined()
    expect(request.buttons).toEqual([{ text: "OK", style: "primary" }])
  })
})
