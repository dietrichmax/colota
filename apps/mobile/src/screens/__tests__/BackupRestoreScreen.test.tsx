import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    const R = require("react")
    R.useEffect(() => {
      const cleanup = cb()
      return typeof cleanup === "function" ? cleanup : undefined
    }, [cb])
  }
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

const mockGetStats = jest.fn()
const mockGetSetting = jest.fn()
const mockSaveSetting = jest.fn()
const mockGetClientCertInfo = jest.fn()

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: (...a: unknown[]) => mockGetStats(...a),
    getSetting: (...a: unknown[]) => mockGetSetting(...a),
    saveSetting: (...a: unknown[]) => mockSaveSetting(...a),
    getClientCertInfo: (...a: unknown[]) => mockGetClientCertInfo(...a)
  }
}))

const mockPasswordStrength = jest.fn()
const mockPickDestination = jest.fn()
const mockPickSource = jest.fn()
const mockCreateBackup = jest.fn()
const mockDescribeBackup = jest.fn()
const mockRestoreBackup = jest.fn()
const mockApplyRestore = jest.fn()

// Every real method is a static opening with ensureModule(), so a bare reference throws.
jest.mock("../../services/BackupService", () => {
  const service: Record<string, unknown> = {}
  const onReceiver = (impl: (...a: unknown[]) => unknown) =>
    function (this: unknown, ...a: unknown[]) {
      if (this !== service) throw new TypeError("undefined is not a function")
      return impl(...a)
    }
  Object.assign(service, {
    passwordStrength: onReceiver((...a) => mockPasswordStrength(...a)),
    pickBackupDestination: onReceiver((...a) => mockPickDestination(...a)),
    pickBackupSource: onReceiver((...a) => mockPickSource(...a)),
    createBackup: onReceiver((...a) => mockCreateBackup(...a)),
    describeBackup: onReceiver((...a) => mockDescribeBackup(...a)),
    restoreBackup: onReceiver((...a) => mockRestoreBackup(...a)),
    applyRestore: onReceiver((...a) => mockApplyRestore(...a))
  })
  return { __esModule: true, default: service }
})

const mockShowConfirm = jest.fn()
const mockShowChoice = jest.fn()
jest.mock("../../services/modalService", () => ({
  showConfirm: (...a: unknown[]) => mockShowConfirm(...a),
  showChoice: (...a: unknown[]) => mockShowChoice(...a)
}))

jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable, TextInput } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    StateLine: ({ label, caption, testID }: any) =>
      R.createElement(View, { testID }, R.createElement(Text, null, label), R.createElement(Text, null, caption)),
    FieldMessage: ({ children, variant }: any) =>
      R.createElement(Text, { accessibilityValue: { text: variant ?? "info" } }, children),
    TextField: ({ label, value, onChangeText, testID, error, disabled }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        R.createElement(TextInput, { testID, value, onChangeText, editable: !disabled }),
        error ? R.createElement(Text, null, error) : null
      ),
    Button: ({ title, onPress, disabled, testID, loading, variant }: any) =>
      R.createElement(
        Pressable,
        {
          testID,
          onPress,
          disabled,
          accessibilityState: { disabled: !!disabled, busy: !!loading },
          accessibilityValue: { text: variant ?? "primary" }
        },
        R.createElement(Text, null, title)
      ),
    LoadingOverlay: ({ visible, title }: any) => (visible ? R.createElement(Text, null, title) : null)
  }
})

import { BackupRestoreScreen } from "../BackupRestoreScreen"

const MADE_AT = "2026-09-03T09:15:00Z"
const manifest = { createdAt: MADE_AT, appVersion: "1.16.0", appBuild: 48, schemaDb: 7 }
const strong = { score: 3, label: "Strong", bits: 62 }

const mockNavigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() }
const renderScreen = () => render(<BackupRestoreScreen navigation={mockNavigation as any} />)

const typeGoodPassword = (api: ReturnType<typeof renderScreen>) => {
  fireEvent.changeText(api.getByTestId("backup-password"), "correct horse battery staple")
  fireEvent.changeText(api.getByTestId("backup-password-confirm"), "correct horse battery staple")
}

const openArchive = async (api: ReturnType<typeof renderScreen>) => {
  fireEvent.press(api.getByTestId("choose-backup-btn"))
  await waitFor(() => expect(api.getByTestId("picked-file")).toBeTruthy())
  fireEvent.changeText(api.getByTestId("restore-password"), "the password")
  fireEvent.press(api.getByTestId("open-backup-btn"))
  await waitFor(() => expect(api.getByTestId("archive-state")).toBeTruthy())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetStats.mockResolvedValue({ total: 12481, databaseSizeMB: 8.42 })
  mockGetSetting.mockResolvedValue(String(Date.parse(MADE_AT)))
  mockSaveSetting.mockResolvedValue(undefined)
  mockGetClientCertInfo.mockResolvedValue(null)
  mockPasswordStrength.mockResolvedValue(strong)
  mockPickDestination.mockResolvedValue("content://dest")
  mockPickSource.mockResolvedValue({ uri: "content://src", displayName: "colota_backup.colota" })
  mockCreateBackup.mockResolvedValue(undefined)
  mockDescribeBackup.mockResolvedValue(manifest)
  mockRestoreBackup.mockResolvedValue(undefined)
  mockApplyRestore.mockResolvedValue(undefined)
  mockShowConfirm.mockResolvedValue(true)
  mockShowChoice.mockResolvedValue(0)
})

describe("BackupRestoreScreen", () => {
  describe("what it says before anything is touched", () => {
    it("opens with whether a backup exists and what one would hold", async () => {
      const api = renderScreen()

      expect(await api.findByText(/^You last backed up /)).toBeTruthy()
      expect(api.getByText("Database: 12,481 locations, 8.42 MB")).toBeTruthy()
    })

    it("says so when there has never been a backup", async () => {
      mockGetSetting.mockResolvedValue(null)
      const api = renderScreen()

      expect(await api.findByText("You have never backed up")).toBeTruthy()
    })

    // The restore half must not open on a red button.
    it("starts restore on a secondary button, not a destructive one", async () => {
      const api = renderScreen()
      await api.findByText(/^You last backed up /)

      expect(api.getByTestId("choose-backup-btn").props.accessibilityValue.text).toBe("secondary")
      expect(api.queryByTestId("restore-btn")).toBeNull()
    })
  })

  describe("making a backup", () => {
    it("says why Create backup is disabled instead of leaving it dead", async () => {
      const api = renderScreen()
      await api.findByText(/^You last backed up /)

      expect(api.getByText("Choose a password first.")).toBeTruthy()
      expect(api.getByTestId("create-backup-btn").props.accessibilityState.disabled).toBe(true)

      fireEvent.changeText(api.getByTestId("backup-password"), "correct horse battery staple")
      await waitFor(() => expect(api.getByText("Type the password a second time.")).toBeTruthy())
    })

    it("blocks a weak password on the score native returned", async () => {
      mockPasswordStrength.mockResolvedValue({ score: 1, label: "Weak", bits: 28 })
      const api = renderScreen()
      await api.findByText(/^You last backed up /)

      typeGoodPassword(api)

      await waitFor(() => expect(api.getByText("This password is too easy to guess.")).toBeTruthy())
      expect(api.getByTestId("create-backup-btn").props.accessibilityState.disabled).toBe(true)
    })

    // A failed strength read used to leave the button dead for the session with no explanation.
    it("says the check failed rather than calling the password weak", async () => {
      mockPasswordStrength.mockRejectedValue(new Error("bridge"))
      const api = renderScreen()
      await api.findByText(/^You last backed up /)

      fireEvent.changeText(api.getByTestId("backup-password"), "correct horse battery staple")

      expect(await api.findByText("Could not check this password. Try again.")).toBeTruthy()
    })

    it("acknowledges the missing recovery path, then writes and records when", async () => {
      const api = renderScreen()
      await api.findByText(/^You last backed up /)
      typeGoodPassword(api)
      await waitFor(() => expect(api.getByTestId("create-backup-btn").props.accessibilityState.disabled).toBe(false))

      fireEvent.press(api.getByTestId("create-backup-btn"))

      await waitFor(() =>
        expect(mockCreateBackup).toHaveBeenCalledWith("content://dest", "correct horse battery staple")
      )
      expect(mockShowConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: "You cannot reset this password" }))
      expect(mockSaveSetting).toHaveBeenCalledWith("last_backup_at", expect.any(String))
      expect(await api.findByText(/^Backup written\./)).toBeTruthy()
    })

    it("writes nothing when the acknowledgement is dismissed", async () => {
      mockShowConfirm.mockResolvedValue(false)
      const api = renderScreen()
      await api.findByText(/^You last backed up /)
      typeGoodPassword(api)
      await waitFor(() => expect(api.getByTestId("create-backup-btn").props.accessibilityState.disabled).toBe(false))

      fireEvent.press(api.getByTestId("create-backup-btn"))

      await waitFor(() => expect(mockShowConfirm).toHaveBeenCalled())
      expect(mockPickDestination).not.toHaveBeenCalled()
      expect(mockCreateBackup).not.toHaveBeenCalled()
    })
  })

  describe("opening an archive before replacing anything", () => {
    /**
     * The whole point of the redesign. A wrong password used to be discovered inside restoreBackup,
     * after tracking was stopped and the auto-export alarm cancelled.
     */
    it("costs a retry and nothing else when the password is wrong", async () => {
      mockDescribeBackup.mockRejectedValue({ code: "E_BACKUP_WRONG_PASSWORD" })
      const api = renderScreen()
      await api.findByText(/^You last backed up /)

      fireEvent.press(api.getByTestId("choose-backup-btn"))
      await waitFor(() => expect(api.getByTestId("picked-file")).toBeTruthy())
      fireEvent.changeText(api.getByTestId("restore-password"), "wrong")
      fireEvent.press(api.getByTestId("open-backup-btn"))

      expect(await api.findByText(/That password did not open this file/)).toBeTruthy()
      expect(mockRestoreBackup).not.toHaveBeenCalled()
      // The file stays picked, so retrying is one press.
      expect(api.getByTestId("picked-file")).toBeTruthy()
    })

    it("offers no destructive button until the archive has been read", async () => {
      const api = renderScreen()
      await api.findByText(/^You last backed up /)

      fireEvent.press(api.getByTestId("choose-backup-btn"))
      await waitFor(() => expect(api.getByTestId("picked-file")).toBeTruthy())

      expect(api.queryByTestId("restore-btn")).toBeNull()
      expect(api.getByText("Not opened yet.")).toBeTruthy()
    })

    it("names the archive's date once it is open, and offers the replace", async () => {
      const api = renderScreen()
      await api.findByText(/^You last backed up /)

      await openArchive(api)

      expect(api.getByText(/^Backup from /)).toBeTruthy()
      expect(api.getByText("Colota 1.16.0 · opened with your password")).toBeTruthy()
      expect(api.getByTestId("restore-btn").props.accessibilityValue.text).toBe("danger")
    })

    // The restore never touches the keystore, so the caveat says the certificate stays, not that it goes.
    it("says once that the certificate is untouched by a restore", async () => {
      mockGetClientCertInfo.mockResolvedValue({ subject: "phone" })
      const api = renderScreen()
      await api.findByText(/^You last backed up /)

      await openArchive(api)

      expect(api.getByText(/client certificate stays as it is/)).toBeTruthy()
    })
  })

  describe("replacing everything", () => {
    it("names the count and the archive date, from a read taken at the press", async () => {
      const api = renderScreen()
      await api.findByText(/^You last backed up /)
      await openArchive(api)
      mockGetStats.mockResolvedValue({ total: 12500, databaseSizeMB: 8.5 })

      fireEvent.press(api.getByTestId("restore-btn"))

      await waitFor(() =>
        expect(mockShowConfirm).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Replace all 12,500 locations?", destructive: true })
        )
      )
      expect(mockRestoreBackup).toHaveBeenCalledWith("content://src", "the password")
    })

    it("replaces nothing when the confirmation is dismissed", async () => {
      const api = renderScreen()
      await api.findByText(/^You last backed up /)
      await openArchive(api)
      mockShowConfirm.mockResolvedValue(false)

      fireEvent.press(api.getByTestId("restore-btn"))

      await waitFor(() => expect(mockShowConfirm).toHaveBeenCalled())
      expect(mockRestoreBackup).not.toHaveBeenCalled()
      expect(mockApplyRestore).not.toHaveBeenCalled()
    })

    /**
     * The decision that matters most. A post-swap failure reported as failed would skip the reload
     * and leave every screen reading a database that no longer exists.
     */
    it.each([
      ["succeeded", undefined],
      ["could not apply the credentials", "E_BACKUP_SECRETS_PARTIAL"],
      ["failed after the swap", "E_BACKUP_RESTORED_INCOMPLETE"]
    ])("reloads the app when the restore %s", async (_label, code) => {
      if (code) mockRestoreBackup.mockRejectedValue({ code })
      const api = renderScreen()
      await api.findByText(/^You last backed up /)
      await openArchive(api)

      fireEvent.press(api.getByTestId("restore-btn"))

      await waitFor(() => expect(mockApplyRestore).toHaveBeenCalled())
      expect(mockShowChoice).toHaveBeenCalledWith(expect.objectContaining({ title: "Your data is restored" }))
    })

    it("does not reload on a failure that never reached the swap", async () => {
      mockRestoreBackup.mockRejectedValue({ code: "E_BACKUP_NO_SPACE" })
      const api = renderScreen()
      await api.findByText(/^You last backed up /)
      await openArchive(api)

      fireEvent.press(api.getByTestId("restore-btn"))

      expect(await api.findByText(/not enough free space/i)).toBeTruthy()
      expect(mockApplyRestore).not.toHaveBeenCalled()
      expect(mockShowChoice).not.toHaveBeenCalled()
    })

    // The row travels inside the archive, so without this it rewinds to the backup before this one.
    it("rewrites the last-backup date from the archive it just restored", async () => {
      const api = renderScreen()
      await api.findByText(/^You last backed up /)
      await openArchive(api)

      fireEvent.press(api.getByTestId("restore-btn"))

      await waitFor(() => expect(mockSaveSetting).toHaveBeenCalledWith("last_backup_at", String(Date.parse(MADE_AT))))
    })

    it("cannot arm two confirmations from two presses inside one render", async () => {
      mockShowConfirm.mockReturnValue(new Promise(() => {}))
      const api = renderScreen()
      await api.findByText(/^You last backed up /)
      await openArchive(api)

      act(() => {
        fireEvent.press(api.getByTestId("restore-btn"))
        fireEvent.press(api.getByTestId("restore-btn"))
      })

      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
      expect(mockShowConfirm).toHaveBeenCalledTimes(1)
    })
  })
})
