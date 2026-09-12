import { describeCertificate } from "../certificateState"
import { CERT_EXPIRY_WARNING_DAYS } from "../../constants"
import { formatDateWithYear, loadDisplayPreferences } from "../geo"

const mockGetSetting = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: { getSetting: (...args: string[]) => mockGetSetting(...args) }
}))

beforeAll(async () => {
  mockGetSetting.mockResolvedValue("")
  await loadDisplayPreferences()
})

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 8, 9, 12, 0, 0)
const cert = (daysLeft: number, extra: Record<string, unknown> = {}) => ({
  configured: true as const,
  subject: "CN=max",
  issuer: "CN=Home CA",
  notBefore: NOW.getTime() - 365 * DAY,
  notAfter: NOW.getTime() + daysLeft * DAY + 1000,
  ...extra
})

describe("describeCertificate", () => {
  it("is Not set without a certificate, so the hub row and the card agree", () => {
    expect(describeCertificate(null).rowSub).toBe("Not set")
    expect(describeCertificate({ configured: false }).state).toBe("none")
  })

  it("reads Valid with the date and where the key lives, since the two origins differ on backup and reinstall", () => {
    const until = formatDateWithYear(Math.floor(cert(300).notAfter / 1000))
    expect(describeCertificate(cert(300, { source: "keychain" }), NOW)).toMatchObject({
      state: "valid",
      word: "Valid",
      caption: `Until ${until} · device credential store`,
      rowSub: `Valid until ${until}`
    })
    expect(describeCertificate(cert(300, { source: "p12" }), NOW).caption).toBe(`Until ${until} · imported .p12`)
  })

  it("warns inside the window, because a CA round trip takes weeks", () => {
    expect(describeCertificate(cert(CERT_EXPIRY_WARNING_DAYS - 1), NOW).word).toBe(
      `Expires in ${CERT_EXPIRY_WARNING_DAYS - 1} days`
    )
    expect(describeCertificate(cert(CERT_EXPIRY_WARNING_DAYS), NOW).state).toBe("valid")
    expect(describeCertificate(cert(1), NOW).word).toBe("Expires in 1 day")
  })

  it("keeps the year on the date, since a certificate can be years away", () => {
    expect(describeCertificate(cert(300), NOW).caption).toMatch(/\b20\d\d\b/)
  })

  it("says what an expired certificate will do", () => {
    const s = describeCertificate(cert(-3), NOW)
    expect(s.word).toBe("Expired")
    expect(s.caption).toMatch(/^Expired .* · the server will refuse it$/)
    expect(describeCertificate(cert(-3), NOW, "server certificate checks will fail").caption).toMatch(
      /server certificate checks will fail$/
    )
  })

  it("names an unreadable store with the bridge's sentence rather than a date it does not have", () => {
    const s = describeCertificate({ configured: true, error: "Keystore entry missing" }, NOW)
    expect(s).toMatchObject({ state: "unreadable", word: "Cannot be read", caption: "Keystore entry missing" })
  })
})
