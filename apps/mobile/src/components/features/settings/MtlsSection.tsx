/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, View, ActivityIndicator } from "react-native"
import { CircleAlert, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { fonts, fontSizes, lineHeights } from "../../../styles/typography"
import { SectionTitle, Card, Divider, Button, FieldMessage, TextField, StateLine, StatRow } from "../../index"
import NativeLocationService from "../../../services/NativeLocationService"
import { showChoice, showConfirm } from "../../../services/modalService"
import { ClientCertInfoResult } from "../../../types/global"
import { describeCertificate, type CertificateState } from "../../../utils/certificateState"
import { logger } from "../../../utils/logger"
import { space } from "../../../constants"

const CLIENT_CERT_ERR: Record<string, string> = {
  E_CERT_PASSWORD: "Incorrect password",
  E_CERT_INVALID: "Not a valid PKCS12 file"
}
const SERVER_CA_ERR: Record<string, string> = {
  E_CA_READ: "Could not read the selected file. Try a smaller file or pick again.",
  E_CA_INVALID: "Not a valid X.509 certificate. Make sure you're picking the CA cert (PEM or DER)."
}

function errMsg(map: Record<string, string>, err: any, fallback: string): string {
  return map[err?.code] ?? err?.message ?? fallback
}

type ImportState =
  { kind: "idle" } | { kind: "picked"; b64: string; password: string; importing: boolean; error: string | null }

const PICK_LINE = "Key stays in the device credential store, survives reinstalling Colota, never backed up."
const IMPORT_LINE =
  "Key moves into the Android Keystore and never leaves the device. The file password is used once and discarded. Not backed up, import again after a restore."

export function MtlsSection() {
  const { colors } = useTheme()
  const [certInfo, setCertInfo] = useState<ClientCertInfoResult | null>(null)
  const [caInfo, setCaInfo] = useState<ClientCertInfoResult | null>(null)
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" })
  const [clientPickError, setClientPickError] = useState<string | null>(null)
  const [caError, setCaError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [client, ca] = await Promise.all([
        NativeLocationService.getClientCertInfo(),
        NativeLocationService.getServerCaInfo()
      ])
      setCertInfo(client)
      setCaInfo(ca)
    } catch (err) {
      logger.error("[MtlsSection] getClientCertInfo/getServerCaInfo failed:", err)
      setCertInfo({ configured: false })
      setCaInfo({ configured: false })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handlePickServerCa = useCallback(async () => {
    setCaError(null)
    try {
      const b64 = await NativeLocationService.pickServerCaFile()
      if (!b64) return
      await NativeLocationService.importServerCa(b64)
      await refresh()
    } catch (err: any) {
      logger.error("[MtlsSection] importServerCa failed:", err)
      setCaError(errMsg(SERVER_CA_ERR, err, "Could not import the CA"))
    }
  }, [refresh])

  const handleClearServerCa = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "Remove trusted CA?",
      message: "Connections to a server signed by it will fail until you import it again.",
      confirmText: "Remove",
      destructive: true
    })
    if (!confirmed) return
    try {
      await NativeLocationService.clearServerCa()
      await refresh()
    } catch (err) {
      logger.error("[MtlsSection] clearServerCa failed:", err)
    }
  }, [refresh])

  const handlePickKeyChain = useCallback(async () => {
    setClientPickError(null)
    try {
      const result = await NativeLocationService.pickKeyChainCert()
      if (!result) return
      await refresh()
    } catch (err: any) {
      logger.error("[MtlsSection] pickKeyChainCert failed:", err)
      setClientPickError(err?.message || "Could not read the selected certificate")
    }
  }, [refresh])

  const handlePickFile = useCallback(async () => {
    setClientPickError(null)
    try {
      const b64 = await NativeLocationService.pickClientCertFile()
      if (!b64) return
      setImportState({ kind: "picked", b64, password: "", importing: false, error: null })
    } catch (err: any) {
      logger.error("[MtlsSection] pick failed:", err)
      setClientPickError(err?.message || "Could not read the selected file")
    }
  }, [])

  const handleImport = useCallback(async () => {
    if (importState.kind !== "picked" || !importState.b64) return
    setImportState({ ...importState, importing: true, error: null })
    try {
      await NativeLocationService.importClientCert(importState.b64, importState.password)
      setImportState({ kind: "idle" })
      await refresh()
    } catch (err: any) {
      setImportState({ ...importState, importing: false, error: errMsg(CLIENT_CERT_ERR, err, "Import failed") })
    }
  }, [importState, refresh])

  const handleReplace = useCallback(async () => {
    const choice = await showChoice({
      title: "Replace certificate",
      message: "The current certificate is replaced as soon as the new one is read.",
      buttons: [
        { text: "Pick from device", style: "primary" },
        { text: "Import .p12", style: "secondary" },
        { text: "Cancel", style: "secondary" }
      ]
    })
    if (choice === 0) handlePickKeyChain()
    else if (choice === 1) handlePickFile()
  }, [handlePickKeyChain, handlePickFile])

  const handleRemove = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "Remove client certificate?",
      message: "Requests to a server that requires it will fail until you add one again.",
      confirmText: "Remove",
      destructive: true
    })
    if (!confirmed) return
    try {
      await NativeLocationService.clearClientCert()
      await refresh()
    } catch (err) {
      logger.error("[MtlsSection] clear failed:", err)
    }
  }, [refresh])

  if (certInfo === null || caInfo === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <>
      <SectionTitle>Client certificate</SectionTitle>
      <Card rows>
        {importState.kind === "picked" ? (
          <View style={styles.block}>
            <View>
              <TextField
                label="File password"
                testID="p12-password"
                value={importState.password}
                onChangeText={(v) => setImportState({ ...importState, password: v, error: null })}
                placeholder="Leave empty if the file has none"
                autoCapitalize="none"
                autoCorrect={false}
                secure
                disabled={importState.importing}
                error={importState.error ?? undefined}
              />
              {!importState.error && (
                <FieldMessage>
                  Used once to unwrap the key, then discarded. Leave empty if the file has none.
                </FieldMessage>
              )}
            </View>
            <View style={styles.buttonRow}>
              <Button style={styles.flex1} onPress={handleImport} title="Import" loading={importState.importing} />
              <Button
                variant="ghost"
                title="Cancel"
                onPress={() => setImportState({ kind: "idle" })}
                disabled={importState.importing}
              />
            </View>
          </View>
        ) : certInfo.configured ? (
          <CertificateCard
            state={describeCertificate(certInfo)}
            subject={certInfo.subject}
            issuer={certInfo.issuer}
            onReplace={handleReplace}
            onRemove={handleRemove}
            removeTestID="remove-cert-btn"
          />
        ) : (
          <View style={styles.block}>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              None. Only for a server that asks for one.
            </Text>
            <View>
              <Button variant="secondary" onPress={handlePickKeyChain} title="Pick from device certificates" />
              <FieldMessage>{PICK_LINE}</FieldMessage>
            </View>
            <View>
              <Button variant="secondary" onPress={handlePickFile} title="Import .p12 / .pfx" />
              <FieldMessage>{IMPORT_LINE}</FieldMessage>
              {clientPickError && <FieldMessage variant="error">{clientPickError}</FieldMessage>}
            </View>
          </View>
        )}
      </Card>

      <SectionTitle style={styles.groupTop}>Trusted server CA</SectionTitle>
      <Card rows>
        {caInfo.configured ? (
          <CertificateCard
            state={describeCertificate(caInfo, undefined, "server certificate checks will fail")}
            subject={caInfo.subject}
            onReplace={handlePickServerCa}
            onRemove={handleClearServerCa}
            removeTestID="remove-ca-btn"
          />
        ) : (
          <View style={styles.block}>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              None. Public CAs such as Let's Encrypt work without it. Add one only for a private or self-signed CA.
              Certificates you installed on the device are not used.
            </Text>
            <View>
              <Button variant="secondary" onPress={handlePickServerCa} title="Import CA (.crt / .pem)" />
              <FieldMessage>Encrypted on this device and included in encrypted backups.</FieldMessage>
              {caError && <FieldMessage variant="error">{caError}</FieldMessage>}
            </View>
          </View>
        )}
      </Card>
    </>
  )
}

const STATE_ICONS: Record<CertificateState["state"], LucideIcon> = {
  none: ShieldCheck,
  valid: ShieldCheck,
  expiring: TriangleAlert,
  expired: CircleAlert,
  unreadable: CircleAlert
}

function CertificateCard({
  state,
  subject,
  issuer,
  onReplace,
  onRemove,
  removeTestID
}: {
  state: CertificateState
  subject?: string
  issuer?: string
  onReplace: () => void
  onRemove: () => void
  removeTestID: string
}) {
  const { colors } = useTheme()
  const tone =
    state.state === "valid"
      ? colors.success
      : state.state === "expiring"
        ? colors.warning
        : state.state === "none"
          ? colors.textSecondary
          : colors.error
  return (
    <>
      <StateLine
        icon={STATE_ICONS[state.state]}
        iconColor={tone}
        label={state.word}
        caption={state.caption}
        testID="certificate-state"
      />
      <Divider tight />
      <View style={styles.details}>
        {subject ? <StatRow label="Subject" value={shortenDn(subject)} /> : null}
        {issuer ? <StatRow label="Issuer" value={shortenDn(issuer)} /> : null}
        <View style={styles.buttonRow}>
          <Button style={styles.flex1} variant="ghost" title="Replace" onPress={onReplace} />
          <Button style={styles.flex1} variant="danger" title="Remove" onPress={onRemove} testID={removeTestID} />
        </View>
      </View>
    </>
  )
}

/**
 * X.500 DNs come back like "CN=foo,O=bar,C=US". Surface CN if present, otherwise
 * the whole thing - users care about identity, not DN parser fidelity.
 */
function shortenDn(dn: string): string {
  const cn = dn.split(",").find((p) => p.trim().toLowerCase().startsWith("cn="))
  return cn ? cn.trim().slice(3) : dn
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  groupTop: {
    marginTop: space.xl
  },
  block: {
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.lg
  },
  details: {
    paddingTop: space.md,
    paddingBottom: space.lg
  },
  description: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    lineHeight: lineHeights.description
  },
  buttonRow: {
    flexDirection: "row",
    gap: space.md,
    alignItems: "center"
  },
  flex1: {
    flex: 1
  }
})
