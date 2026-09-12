import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { ActivityIndicator } from "react-native"
import { CERT_EXPIRY_WARNING_DAYS } from "../../../../constants"

jest.mock("../../../index", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    TextField: require("../../../../testing/componentStubs").TextFieldStub,
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    Button: ({ title, onPress, disabled, testID }: any) =>
      R.createElement(
        Pressable,
        { onPress, disabled, testID, accessibilityRole: "button" },
        R.createElement(Text, null, title)
      ),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children),
    StateLine: ({ label, caption, testID }: any) =>
      R.createElement(View, { testID }, R.createElement(Text, null, label), R.createElement(Text, null, caption)),
    StatRow: ({ label, value }: any) =>
      R.createElement(View, null, R.createElement(Text, null, label), R.createElement(Text, null, value))
  }
})

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

const mockShowConfirm = jest.fn().mockResolvedValue(true)
const mockShowChoice = jest.fn().mockResolvedValue(2)
jest.mock("../../../../services/modalService", () => ({
  showConfirm: (...a: any[]) => mockShowConfirm(...a),
  showChoice: (...a: any[]) => mockShowChoice(...a)
}))

const mockGetClientCertInfo = jest.fn().mockResolvedValue({ configured: false })
const mockGetServerCaInfo = jest.fn().mockResolvedValue({ configured: false })
const mockPickClientCertFile = jest.fn().mockResolvedValue(null)
const mockPickKeyChainCert = jest.fn().mockResolvedValue(null)
const mockImportClientCert = jest.fn().mockResolvedValue({})
const mockClearClientCert = jest.fn().mockResolvedValue(true)
const mockPickServerCaFile = jest.fn().mockResolvedValue(null)
const mockImportServerCa = jest.fn().mockResolvedValue({})
const mockClearServerCa = jest.fn().mockResolvedValue(true)

jest.mock("../../../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getClientCertInfo: (...a: any[]) => mockGetClientCertInfo(...a),
    getServerCaInfo: (...a: any[]) => mockGetServerCaInfo(...a),
    pickClientCertFile: (...a: any[]) => mockPickClientCertFile(...a),
    pickKeyChainCert: (...a: any[]) => mockPickKeyChainCert(...a),
    importClientCert: (...a: any[]) => mockImportClientCert(...a),
    clearClientCert: (...a: any[]) => mockClearClientCert(...a),
    pickServerCaFile: (...a: any[]) => mockPickServerCaFile(...a),
    importServerCa: (...a: any[]) => mockImportServerCa(...a),
    clearServerCa: (...a: any[]) => mockClearServerCa(...a)
  }
}))

import { MtlsSection } from "../MtlsSection"

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const loaded = (daysLeft: number, extra: Record<string, unknown> = {}) => ({
  configured: true,
  subject: "CN=colota-test-client,O=Colota",
  issuer: "CN=Test CA",
  notBefore: Date.now() - ONE_DAY_MS,
  notAfter: Date.now() + daysLeft * ONE_DAY_MS + 60_000,
  ...extra
})

describe("MtlsSection", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetClientCertInfo.mockResolvedValue({ configured: false })
    mockGetServerCaInfo.mockResolvedValue({ configured: false })
    mockShowConfirm.mockResolvedValue(true)
    mockShowChoice.mockResolvedValue(2)
  })

  describe("loading and empty", () => {
    it("spins before the first read resolves, never the word", () => {
      mockGetClientCertInfo.mockReturnValue(new Promise(() => {}))
      mockGetServerCaInfo.mockReturnValue(new Promise(() => {}))
      const { UNSAFE_getByType, queryByText } = render(<MtlsSection />)
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy()
      expect(queryByText("Loading...")).toBeNull()
    })

    it("offers the two paths as equals, each with its custody line", async () => {
      const { findByText, getByText } = render(<MtlsSection />)

      expect(await findByText("Pick from device certificates")).toBeTruthy()
      expect(
        getByText("Key stays in the device credential store, survives reinstalling Colota, never backed up.")
      ).toBeTruthy()
      expect(getByText("Import .p12 / .pfx")).toBeTruthy()
      expect(getByText(/^Key moves into the Android Keystore/)).toBeTruthy()
      expect(getByText("None. Only for a server that asks for one.")).toBeTruthy()
    })

    it("says when a CA is needed at all and where it lives", async () => {
      const { findByText, getByText } = render(<MtlsSection />)

      expect(await findByText("Import CA (.crt / .pem)")).toBeTruthy()
      expect(getByText(/^None\. Public CAs such as Let's Encrypt work without it\./)).toBeTruthy()
      expect(getByText("Encrypted on this device and included in encrypted backups.")).toBeTruthy()
    })
  })

  describe("client cert: KeyChain pick", () => {
    it("refreshes info after a successful KeyChain pick", async () => {
      mockPickKeyChainCert.mockResolvedValueOnce({ configured: true, subject: "CN=picked" })
      mockGetClientCertInfo
        .mockResolvedValueOnce({ configured: false })
        .mockResolvedValueOnce(loaded(365, { source: "keychain" }))

      const { findByText } = render(<MtlsSection />)
      fireEvent.press(await findByText("Pick from device certificates"))

      await waitFor(() => expect(mockGetClientCertInfo).toHaveBeenCalledTimes(2))
    })

    it("does not refresh when the user cancels the KeyChain picker", async () => {
      const { findByText } = render(<MtlsSection />)
      fireEvent.press(await findByText("Pick from device certificates"))
      await waitFor(() => expect(mockPickKeyChainCert).toHaveBeenCalled())
      expect(mockGetClientCertInfo).toHaveBeenCalledTimes(1)
    })
  })

  describe("client cert: .p12 import", () => {
    it("asks for the file password after a pick and says the password is used once", async () => {
      mockPickClientCertFile.mockResolvedValueOnce("BASE64")
      const { findByText, getByText } = render(<MtlsSection />)

      fireEvent.press(await findByText("Import .p12 / .pfx"))

      expect(await findByText("File password")).toBeTruthy()
      expect(getByText("Used once to unwrap the key, then discarded. Leave empty if the file has none.")).toBeTruthy()
      expect(getByText("Import")).toBeTruthy()
      expect(getByText("Cancel")).toBeTruthy()
    })

    it("surfaces a wrong password on the field and keeps the form", async () => {
      mockPickClientCertFile.mockResolvedValueOnce("BASE64")
      mockImportClientCert.mockRejectedValueOnce({ code: "E_CERT_PASSWORD" })
      const { findByText, getByText } = render(<MtlsSection />)

      fireEvent.press(await findByText("Import .p12 / .pfx"))
      fireEvent.press(await findByText("Import"))

      expect(await findByText("Incorrect password")).toBeTruthy()
      expect(getByText("File password")).toBeTruthy()
    })

    it("Cancel returns to the empty state", async () => {
      mockPickClientCertFile.mockResolvedValueOnce("BASE64")
      const { findByText, queryByText } = render(<MtlsSection />)

      fireEvent.press(await findByText("Import .p12 / .pfx"))
      fireEvent.press(await findByText("Cancel"))

      await waitFor(() => expect(queryByText("File password")).toBeNull())
      expect(await findByText("Pick from device certificates")).toBeTruthy()
    })
  })

  describe("client cert: loaded", () => {
    it("opens with the certificate's state and origin, then subject and issuer as ledger rows", async () => {
      mockGetClientCertInfo.mockResolvedValue(loaded(320, { source: "keychain" }))
      const { findByText, getByText } = render(<MtlsSection />)

      expect(await findByText("Valid")).toBeTruthy()
      expect(getByText(/^Until .* · device credential store$/)).toBeTruthy()
      expect(getByText("colota-test-client")).toBeTruthy()
      expect(getByText("Test CA")).toBeTruthy()
      expect(getByText("Replace")).toBeTruthy()
      expect(getByText("Remove")).toBeTruthy()
    })

    it("warns inside the window as a word, never a fill", async () => {
      mockGetClientCertInfo.mockResolvedValue(loaded(5, { source: "p12" }))
      const { findByText } = render(<MtlsSection />)

      expect(await findByText("Expires in 5 days")).toBeTruthy()
      expect(CERT_EXPIRY_WARNING_DAYS).toBe(30)
    })

    it("says what an expired certificate will do", async () => {
      mockGetClientCertInfo.mockResolvedValue(loaded(-1))
      const { findByText, getByText } = render(<MtlsSection />)

      expect(await findByText("Expired")).toBeTruthy()
      expect(getByText(/the server will refuse it$/)).toBeTruthy()
    })

    it("removes only after the confirm that says what will fail", async () => {
      mockGetClientCertInfo.mockResolvedValue(loaded(320))
      mockShowConfirm.mockResolvedValueOnce(false)
      const { findByTestId } = render(<MtlsSection />)

      fireEvent.press(await findByTestId("remove-cert-btn"))
      await waitFor(() =>
        expect(mockShowConfirm).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Remove client certificate?", destructive: true })
        )
      )
      expect(mockClearClientCert).not.toHaveBeenCalled()

      mockShowConfirm.mockResolvedValueOnce(true)
      fireEvent.press(await findByTestId("remove-cert-btn"))
      await waitFor(() => expect(mockClearClientCert).toHaveBeenCalled())
      expect(mockGetClientCertInfo).toHaveBeenCalledTimes(2)
    })

    it("Replace offers the same two paths and runs the chosen one", async () => {
      mockGetClientCertInfo.mockResolvedValue(loaded(320))
      mockShowChoice.mockResolvedValueOnce(1)
      mockPickClientCertFile.mockResolvedValueOnce("BASE64")
      const { findByText } = render(<MtlsSection />)

      fireEvent.press(await findByText("Replace"))

      await waitFor(() =>
        expect(mockShowChoice).toHaveBeenCalledWith(expect.objectContaining({ title: "Replace certificate" }))
      )
      expect(await findByText("File password")).toBeTruthy()
    })
  })

  describe("trusted server CA", () => {
    it("shows friendly errors from the picker and the parser", async () => {
      mockPickServerCaFile.mockResolvedValueOnce("BASE64")
      mockImportServerCa.mockRejectedValueOnce({ code: "E_CA_INVALID" })
      const { findByText } = render(<MtlsSection />)

      fireEvent.press(await findByText("Import CA (.crt / .pem)"))

      expect(await findByText(/^Not a valid X\.509 certificate/)).toBeTruthy()
    })

    it("reads Valid when loaded and removes only after the confirm", async () => {
      mockGetServerCaInfo.mockResolvedValue(loaded(900))
      const { findByTestId, getByText } = render(<MtlsSection />)

      fireEvent.press(await findByTestId("remove-ca-btn"))

      await waitFor(() =>
        expect(mockShowConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Remove trusted CA?" }))
      )
      await waitFor(() => expect(mockClearServerCa).toHaveBeenCalled())
      expect(getByText("Valid")).toBeTruthy()
    })

    it("names the consequence of an expired CA", async () => {
      mockGetServerCaInfo.mockResolvedValue(loaded(-2))
      const { findByText } = render(<MtlsSection />)

      expect(await findByText(/server certificate checks will fail$/)).toBeTruthy()
    })
  })
})
