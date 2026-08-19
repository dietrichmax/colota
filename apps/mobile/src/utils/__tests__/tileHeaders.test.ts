import { tileServerUserAgent, registerTileServerUserAgent } from "../tileHeaders"
import { REPO_URL } from "../../constants"

const mockGetBuildConfig = jest.fn()
const mockAddHeader = jest.fn()

jest.mock("@maplibre/maplibre-react-native", () => ({
  TransformRequestManager: { addHeader: (...args: any[]) => mockAddHeader(...args) }
}))

jest.mock("../../services/NativeLocationService", () => {
  const service = { getBuildConfig: (...args: any[]) => mockGetBuildConfig(...args) }
  return { __esModule: true, default: service }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockGetBuildConfig.mockReturnValue({ VERSION_NAME: "1.14.0" })
})

describe("tileServerUserAgent", () => {
  // Exact match rather than a pattern: the privacy policy commits to sending no device, install or
  // user identifier and nothing in the app misbehaves if one leaks in
  it("carries the version and the repo URL and nothing else", () => {
    expect(tileServerUserAgent()).toBe(`Colota/1.14.0 (+${REPO_URL})`)
  })

  it("ignores the rest of BuildConfig", () => {
    mockGetBuildConfig.mockReturnValue({
      VERSION_NAME: "1.14.0",
      VERSION_CODE: 45,
      FLAVOR: "gms",
      NDK_VERSION: "27.1"
    })

    expect(tileServerUserAgent()).toBe(`Colota/1.14.0 (+${REPO_URL})`)
  })

  it("falls back when BuildConfig is unavailable", () => {
    mockGetBuildConfig.mockReturnValue(null)

    expect(tileServerUserAgent()).toBe(`Colota/dev (+${REPO_URL})`)
  })
})

describe("registerTileServerUserAgent", () => {
  it("registers the header under a stable id", () => {
    registerTileServerUserAgent()

    expect(mockAddHeader).toHaveBeenCalledWith({
      id: "colota-user-agent",
      name: "User-Agent",
      value: `Colota/1.14.0 (+${REPO_URL})`
    })
  })
})
