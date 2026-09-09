import { allSub, deleteCopy, olderSub, scopeSub } from "../dataScope"
import { formatDate, loadDisplayPreferences } from "../geo"

const mockGetSetting = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: { getSetting: (...args: string[]) => mockGetSetting(...args) }
}))

beforeAll(async () => {
  mockGetSetting.mockResolvedValue("")
  await loadDisplayPreferences()
})

const CUTOFF = Math.floor(new Date(2026, 5, 10, 12, 0, 0).getTime() / 1000)

describe("scopeSub", () => {
  it("says of the queue that no copy survives, because these were never uploaded", () => {
    expect(scopeSub("queued", 412)).toBe(
      "412 locations waiting to upload. Nothing else holds a copy, and they leave History too."
    )
  })

  it("says of the synced set that an import counts as synced, which no label has said", () => {
    // bulkInsertImportedLocations writes sent = 1, so an archive that never touched a network is inside this delete.
    expect(scopeSub("synced", 12068)).toBe(
      "12,068 locations already on your server. Imported locations count as synced."
    )
  })

  it("explains a disabled row in its own slot instead of leaving it blank", () => {
    expect(scopeSub("queued", 0)).toBe("Nothing queued.")
    expect(scopeSub("synced", 0)).toBe("Nothing has been uploaded yet.")
  })

  it("agrees with itself at one, so no row says 1 locations", () => {
    expect(scopeSub("queued", 1)).toMatch(/^1 location waiting/)
    expect(scopeSub("synced", 1)).toMatch(/^1 location already/)
  })
})

describe("olderSub", () => {
  it("names the boundary the count used", () => {
    expect(olderSub(3120, 90, CUTOFF)).toBe(`Recorded before ${formatDate(CUTOFF)}.`)
  })

  // Counting those reads every matching row, so the confirmation is the only place worth taking it.
  it("leaves how many were never uploaded to the confirmation", () => {
    expect(olderSub(3120, 90, CUTOFF)).not.toContain("uploaded")
  })

  it("says nothing matches rather than offering a delete of zero", () => {
    expect(olderSub(0, 90, CUTOFF)).toBe("Nothing on this device is older than 90 days.")
    expect(olderSub(0, 1, CUTOFF)).toBe("Nothing on this device is older than 1 day.")
  })
})

describe("allSub", () => {
  it("names the trip splits and merges, which no label, hint or dialog has ever named", () => {
    // clearAllLocations empties boundary_overrides as well as locations and the queue.
    expect(allSub(12480)).toBe(
      "All 12,480 locations and every trip split and merge you made. Geofences, profiles and settings stay."
    )
  })
})

describe("deleteCopy", () => {
  it("tells the queued case that the recordings go, not the pending uploads", () => {
    const copy = deleteCopy("queued", 412)
    expect(copy.title).toBe("Delete 412 queued locations?")
    expect(copy.message).toMatch(/^These are the locations themselves, not their pending uploads\./)
    expect(copy.message).toMatch(/no copy survives anywhere and they leave History too/)
    // The one confirmation that used to omit it, while destroying recordings.
    expect(copy.message).toMatch(/This cannot be undone\.$/)
    expect(copy.confirmText).toBe("Delete")
  })

  it("tells the synced case that History empties and an import is included", () => {
    const copy = deleteCopy("synced", 12068)
    expect(copy.title).toBe("Delete 12,068 synced locations?")
    expect(copy.message).toMatch(/not an upload record/)
    expect(copy.message).toMatch(/locations you imported count as synced/)
    expect(copy.message).toMatch(/Copies already on your server stay there/)
  })

  it("tells the age case that it ignores sync state, naming the boundary and the unsent matches", () => {
    const copy = deleteCopy("older", 3120, { days: 90, cutoffSeconds: CUTOFF, unsent: 96 })
    expect(copy.title).toBe("Delete 3,120 locations older than 90 days?")
    expect(copy.message).toMatch(new RegExp(`before ${formatDate(CUTOFF)}`))
    expect(copy.message).toMatch(/96 of them have never been uploaded, so no copy of those survives/)
  })

  it("drops the unsent clause from the age case when there is none, leaving one space between sentences", () => {
    const copy = deleteCopy("older", 3120, { days: 90, cutoffSeconds: CUTOFF, unsent: 0 })
    expect(copy.message).not.toMatch(/never been uploaded/)
    expect(copy.message).not.toMatch(/ {2}/)
  })

  it("tells the everything case about the trip splits and what survives, and asks for a distinct verb", () => {
    const copy = deleteCopy("all", 12480)
    expect(copy.title).toBe("Delete all 12,480 locations?")
    expect(copy.message).toMatch(/every manual trip split and merge you made/)
    expect(copy.message).toMatch(/settings, geofences and profiles stay/)
    expect(copy.confirmText).toBe("Delete all")
  })

  it("ends every confirmation with the permanence, since none of the four can be undone", () => {
    const cases = [
      deleteCopy("queued", 1),
      deleteCopy("synced", 1),
      deleteCopy("older", 1, { days: 1, cutoffSeconds: CUTOFF, unsent: 0 }),
      deleteCopy("all", 1)
    ]
    for (const copy of cases) expect(copy.message).toMatch(/This cannot be undone\.$/)
  })
})
