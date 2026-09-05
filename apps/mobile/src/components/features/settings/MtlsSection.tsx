/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, View } from "react-native"
import { useTheme } from "../../../hooks/useTheme"
import { useTranslation } from "../../../i18n/useTranslation"
import { text } from "../../../styles/typography"
import { space } from "../../../constants"
import { SectionTitle, Button, FieldMessage, StatRow, TextField } from "../../index"
import NativeLocationService from "../../../services/NativeLocationService"
import { ClientCertInfoResult } from "../../../types/global"
import { logger } from "../../../utils/logger"

const EXPIRY_WARNING_DAYS = 14
const MS_PER_DAY = 1000 * 60 * 60 * 24

const CLIENT_CERT_ERR: Record<string, string> = {
  E_CERT_PASSWORD: "mtls.error.certPassword",
  E_CERT_INVALID: "mtls.error.certInvalid"
}
const SERVER_CA_ERR: Record<string, string> = {
  E_CA_READ: "mtls.error.caRead",
  E_CA_INVALID: "mtls.error.caInvalid"
}

type Translate = (key: string, options?: Record<string, unknown>) => string

function errMsg(map: Record<string, string>, err: any, fallbackKey: string, t: Translate): string {
  const key = map[err?.code]
  if (key) return t(key)
  return err?.message ?? t(fallbackKey)
}

type ImportState =
  { kind: "idle" } | { kind: "picked"; b64: string; password: string; importing: boolean; error: string | null }

export function MtlsSection() {
  const { colors } = useTheme()
  const { t } = useTranslation()
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
      setCaError(errMsg(SERVER_CA_ERR, err, "mtls.error.caImport", t))
    }
  }, [refresh, t])

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
      setClientPickError(err?.message || t("mtls.error.certRead"))
    }
  }, [refresh, t])

  const handlePickFile = useCallback(async () => {
    setClientPickError(null)
    try {
      const b64 = await NativeLocationService.pickClientCertFile()
      if (!b64) return // user cancelled
      setImportState({ kind: "picked", b64, password: "", importing: false, error: null })
    } catch (err: any) {
      logger.error("[MtlsSection] pick failed:", err)
      setClientPickError(err?.message || t("mtls.error.fileRead"))
    }
  }, [t])

  const handleImport = useCallback(async () => {
    if (importState.kind !== "picked" || !importState.b64) return
    setImportState({ ...importState, importing: true, error: null })
    try {
      await NativeLocationService.importClientCert(importState.b64, importState.password)
      setImportState({ kind: "idle" })
      await refresh()
    } catch (err: any) {
      setImportState({
        ...importState,
        importing: false,
        error: errMsg(CLIENT_CERT_ERR, err, "mtls.error.importFailed", t)
      })
    }
  }, [importState, refresh, t])

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
    return <Text style={[styles.muted, { color: colors.textSecondary }]}>{t("mtls.loading")}</Text>
  }

  return (
    <>
      {importState.kind === "picked" ? (
        <View>
          <TextField
            testID="p12-password-input"
            label={t("mtls.password")}
            hint={t("mtls.password.hint")}
            value={importState.password}
            onChangeText={(v) => setImportState({ ...importState, password: v, error: null })}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            secureTextEntry
            editable={!importState.importing}
          />
          {importState.error && <FieldMessage variant="error">{importState.error}</FieldMessage>}
          <View style={styles.buttonRow}>
            <Button
              style={styles.flex1}
              onPress={handleImport}
              loading={importState.importing}
              title={t("mtls.save")}
            />
            <Button
              variant="secondary"
              title={t("mtls.cancel")}
              onPress={handleCancelImport}
              disabled={importState.importing}
            />
          </View>
        </View>
      ) : certInfo.configured ? (
        <CertDetails
          info={certInfo}
          showIssuer
          removeLabel={t("mtls.removeCertificate")}
          expiredMessage={t("mtls.certificate.expired")}
          expiringSoonMessage={(d) => t("mtls.certificate.expiringSoon", { count: d })}
          errorMessage={(reason) => t("mtls.certificate.unreadable", { reason })}
          onRemove={handleRemove}
          onReimport={handlePickFile}
        />
      ) : (
        <View>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>{t("mtls.certificate.none")}</Text>
          <Button style={styles.stackedButton} onPress={handlePickKeyChain} title={t("mtls.pickFromDevice")} />
          <FieldMessage>{t("mtls.pickFromDevice.hint")}</FieldMessage>
          <Button style={styles.stackedButton} onPress={handlePickFile} title={t("mtls.importP12")} />
          {clientPickError && <FieldMessage variant="error">{clientPickError}</FieldMessage>}
        </View>
      )}

      <SectionTitle>{t("mtls.trustedCa")}</SectionTitle>
      {caInfo.configured ? (
        <CertDetails
          info={caInfo}
          showIssuer={false}
          removeLabel={t("mtls.removeCa")}
          expiredMessage={t("mtls.ca.expired")}
          expiringSoonMessage={(d) => t("mtls.ca.expiringSoon", { count: d })}
          errorMessage={(reason) => t("mtls.ca.unreadable", { reason })}
          onRemove={handleClearServerCa}
          onReimport={handlePickServerCa}
        />
      ) : (
        <View>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>{t("mtls.ca.none")}</Text>
          <Button style={styles.stackedButton} onPress={handlePickServerCa} title={t("mtls.importCa")} />
          {caError && <FieldMessage variant="error">{caError}</FieldMessage>}
        </View>
      )}
    </>
  )
}

type CertDetailsProps = {
  info: Extract<ClientCertInfoResult, { configured: true }>
  showIssuer: boolean
  removeLabel: string
  expiredMessage: string
  expiringSoonMessage: (days: number) => string
  errorMessage: (reason: string) => string
  onRemove: () => void
  onReimport: () => void
}

function CertDetails({
  info,
  showIssuer,
  removeLabel,
  expiredMessage,
  expiringSoonMessage,
  errorMessage,
  onRemove,
  onReimport
}: CertDetailsProps) {
  const { t } = useTranslation()
  const issuerMissing = showIssuer && !info.issuer

  if (info.error || !info.notAfter || !info.subject || issuerMissing) {
    return (
      <View>
        <FieldMessage variant="error">{errorMessage(info.error || t("mtls.missingFields"))}</FieldMessage>
        <View style={styles.buttonRow}>
          <Button style={styles.flex1} onPress={onReimport} title={t("mtls.reimport")} />
          <Button variant="danger" title={t("mtls.remove")} onPress={onRemove} />
        </View>
      </View>
    )
  }

  const notAfterDate = new Date(info.notAfter)
  const daysUntilExpiry = Math.floor((info.notAfter - Date.now()) / MS_PER_DAY)
  const expired = daysUntilExpiry < 0
  const expiringSoon = !expired && daysUntilExpiry < EXPIRY_WARNING_DAYS

  return (
    <View>
      <StatRow label={t("mtls.subject")} value={shortenDn(info.subject)} divider />
      {showIssuer && info.issuer && <StatRow label={t("mtls.issuer")} value={shortenDn(info.issuer)} divider />}
      <StatRow
        label={t("mtls.expires")}
        value={
          expired
            ? t("mtls.expires.past", { date: notAfterDate.toISOString().slice(0, 10) })
            : t("mtls.expires.future", { date: notAfterDate.toISOString().slice(0, 10), count: daysUntilExpiry })
        }
      />
      {expired && <FieldMessage variant="error">{expiredMessage}</FieldMessage>}
      {expiringSoon && <FieldMessage variant="warning">{expiringSoonMessage(daysUntilExpiry)}</FieldMessage>}
      <Button style={styles.stackedButton} variant="dangerGhost" align="start" title={removeLabel} onPress={onRemove} />
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
  muted: {
    ...text.body
  },
  stackedButton: {
    marginTop: space.md
  },
  buttonRow: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.md,
    alignItems: "center"
  },
  flex1: {
    flex: 1
  }
})
