/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, TextInput, View } from "react-native"
import { useTheme } from "../../../hooks/useTheme"
import { fonts, fontSizes } from "../../../styles/typography"
import { SectionTitle, Card, Divider, Button, FieldMessage } from "../../index"
import NativeLocationService from "../../../services/NativeLocationService"
import { ClientCertInfoResult } from "../../../types/global"
import { logger } from "../../../utils/logger"

const EXPIRY_WARNING_DAYS = 14

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
      if (!result) return // user cancelled
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
      if (!b64) return // user cancelled
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

  const handleCancelImport = useCallback(() => {
    setImportState({ kind: "idle" })
  }, [])

  const handleRemove = useCallback(async () => {
    try {
      await NativeLocationService.clearClientCert()
      await refresh()
    } catch (err) {
      logger.error("[MtlsSection] clear failed:", err)
    }
  }, [refresh])

  if (certInfo === null || caInfo === null) {
    return (
      <View style={styles.section}>
        <SectionTitle>Client Certificate (mTLS)</SectionTitle>
        <Card>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>Loading...</Text>
        </Card>
      </View>
    )
  }

  return (
    <>
      <View style={styles.section}>
        <SectionTitle>Client Certificate (mTLS)</SectionTitle>
        <Card>
          {importState.kind === "picked" ? (
            <View>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Password (leave empty if none)</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background
                  }
                ]}
                value={importState.password}
                onChangeText={(v) => setImportState({ ...importState, password: v, error: null })}
                placeholder="PKCS12 password"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                editable={!importState.importing}
              />
              {importState.error && <FieldMessage variant="error">{importState.error}</FieldMessage>}
              <View style={styles.buttonRow}>
                <Button
                  style={styles.flex1}
                  onPress={handleImport}
                  title={importState.importing ? "Importing..." : "Save"}
                />
                <Button
                  variant="secondary"
                  title="Cancel"
                  onPress={handleCancelImport}
                  disabled={importState.importing}
                />
              </View>
            </View>
          ) : certInfo.configured ? (
            <CertCard
              info={certInfo}
              showIssuer
              expiryWarningDays={EXPIRY_WARNING_DAYS}
              removeLabel="Remove Certificate"
              expiredMessage="Certificate has expired. Server will reject connections."
              expiringSoonMessage={(d) => `Certificate expires in ${d} day(s). Renew soon.`}
              errorPrefix="Stored certificate could not be read"
              onRemove={handleRemove}
              onReimport={handlePickFile}
            />
          ) : (
            <View>
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                No client certificate configured. Required if your server enforces mutual TLS authentication.
              </Text>
              <Button style={styles.importButton} onPress={handlePickKeyChain} title="Pick from device certificates" />
              <FieldMessage>
                Uses a cert already installed in Android (private key stays in the OS keystore).
              </FieldMessage>
              <Button style={styles.importButton} onPress={handlePickFile} title="Import .p12 / .pfx" />
              {clientPickError && <FieldMessage variant="error">{clientPickError}</FieldMessage>}
            </View>
          )}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle>Trusted Server CA</SectionTitle>
        <Card>
          {caInfo.configured ? (
            <CertCard
              info={caInfo}
              showIssuer={false}
              expiryWarningDays={EXPIRY_WARNING_DAYS}
              removeLabel="Remove CA"
              expiredMessage="CA has expired. Server cert validation will fail."
              expiringSoonMessage={(d) => `CA expires in ${d} day(s). Renew soon.`}
              errorPrefix="Stored CA could not be read"
              onRemove={handleClearServerCa}
              onReimport={handlePickServerCa}
            />
          ) : (
            <View>
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                Only needed if your server uses a private / self-signed CA that public Android trust store doesn't know
                about. Publicly-trusted certs (Let's Encrypt, Cloudflare) work without this.
              </Text>
              <Button style={styles.importButton} onPress={handlePickServerCa} title="Import CA (.crt / .pem)" />
              {caError && <FieldMessage variant="error">{caError}</FieldMessage>}
            </View>
          )}
        </Card>
      </View>
    </>
  )
}

type CertCardProps = {
  info: Extract<ClientCertInfoResult, { configured: true }>
  showIssuer: boolean
  expiryWarningDays: number
  removeLabel: string
  expiredMessage: string
  expiringSoonMessage: (days: number) => string
  errorPrefix: string
  onRemove: () => void
  onReimport: () => void
}

function CertCard({
  info,
  showIssuer,
  expiryWarningDays,
  removeLabel,
  expiredMessage,
  expiringSoonMessage,
  errorPrefix,
  onRemove,
  onReimport
}: CertCardProps) {
  const issuerMissing = showIssuer && !info.issuer
  if (info.error || !info.notAfter || !info.subject || issuerMissing) {
    return (
      <View>
        <FieldMessage variant="error">
          {errorPrefix}: {info.error || "missing fields"}. Re-import to fix.
        </FieldMessage>
        <View style={styles.buttonRow}>
          <Button style={styles.flex1} onPress={onReimport} title="Re-import" />
          <Button variant="danger" title="Remove" onPress={onRemove} />
        </View>
      </View>
    )
  }

  const notAfterDate = new Date(info.notAfter)
  const daysUntilExpiry = Math.floor((info.notAfter - Date.now()) / (1000 * 60 * 60 * 24))
  const expired = daysUntilExpiry < 0
  const expiringSoon = !expired && daysUntilExpiry < expiryWarningDays

  return (
    <View>
      <DetailRow label="Subject" value={shortenDn(info.subject)} />
      {showIssuer && info.issuer && (
        <>
          <Divider />
          <DetailRow label="Issuer" value={shortenDn(info.issuer)} />
        </>
      )}
      <Divider />
      <DetailRow
        label="Expires"
        value={`${notAfterDate.toISOString().slice(0, 10)} (${expired ? "expired" : `in ${daysUntilExpiry}d`})`}
      />
      {expired && <FieldMessage variant="error">{expiredMessage}</FieldMessage>}
      {expiringSoon && <FieldMessage variant="warning">{expiringSoonMessage(daysUntilExpiry)}</FieldMessage>}
      <View style={styles.buttonRow}>
        <Button style={styles.flex1} variant="danger" title={removeLabel} onPress={onRemove} />
      </View>
    </View>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme()
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
    </View>
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
  section: {
    marginBottom: 24
  },
  muted: {
    fontSize: 13,
    ...fonts.regular,
    lineHeight: 18
  },
  fieldLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: 8
  },
  input: {
    borderWidth: 1.5,
    padding: 14,
    borderRadius: 12,
    fontSize: 15
  },
  importButton: {
    marginTop: 12
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    alignItems: "center"
  },
  flex1: {
    flex: 1
  },
  detailRow: {
    paddingVertical: 10
  },
  detailLabel: {
    fontSize: 12,
    ...fonts.medium,
    marginBottom: 2
  },
  detailValue: {
    fontSize: 14,
    ...fonts.regular
  }
})
