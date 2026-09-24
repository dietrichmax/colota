/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { StyleSheet, View, ActivityIndicator } from "react-native"
import {
  CircleAlert,
  Download,
  FileKey,
  KeyRound,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon
} from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { SectionTitle, Card, Divider, Button, FieldMessage, ListItem, TextField, StateLine, StatRow } from "../../index"
import NativeLocationService from "../../../services/NativeLocationService"
import { showChoice, showConfirm } from "../../../services/modalService"
import { ClientCertInfoResult } from "../../../types/global"
import { describeCertificate, type CertificateState } from "../../../utils/certificateState"
import { logger } from "../../../utils/logger"
import { space } from "../../../constants"
import { t } from "../../../i18n/t"
import { useTranslation } from "../../../i18n/useTranslation"
import type { TranslationKey } from "../../../i18n/options"

const CLIENT_CERT_ERR: Record<string, TranslationKey> = {
  E_CERT_PASSWORD: "mtls.err.password",
  E_CERT_INVALID: "mtls.err.invalid"
}
const SERVER_CA_ERR: Record<string, TranslationKey> = {
  E_CA_READ: "mtls.err.caRead",
  E_CA_INVALID: "mtls.err.caInvalid"
}

function errMsg(map: Record<string, TranslationKey>, err: any, fallback: TranslationKey): string {
  const key = map[err?.code]
  return key ? t(key) : (err?.message ?? t(fallback))
}

type ImportState =
  { kind: "idle" } | { kind: "picked"; b64: string; password: string; importing: boolean; error: string | null }

export function MtlsSection() {
  const { colors } = useTheme()
  // Subscribes to language changes; the strings below come from the non-hook t().
  useTranslation()
  const [certInfo, setCertInfo] = useState<ClientCertInfoResult | null>(null)
  const [caInfo, setCaInfo] = useState<ClientCertInfoResult | null>(null)
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" })
  const [clientPickError, setClientPickError] = useState<string | null>(null)
  const [pickNote, setPickNote] = useState<string | null>(null)
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
      setCaError(errMsg(SERVER_CA_ERR, err, "mtls.err.caImport"))
    }
  }, [refresh])

  const handleClearServerCa = useCallback(async () => {
    const confirmed = await showConfirm({
      title: t("mtls.removeCa.title"),
      message: t("mtls.removeCa.message"),
      confirmText: t("common.remove"),
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
    setPickNote(null)
    try {
      const result = await NativeLocationService.pickKeyChainCert()
      if (!result) {
        // Android reports an empty picker and a cancelled one the same way, so the line covers both.
        setPickNote(t("mtls.noPick"))
        return
      }
      await refresh()
    } catch (err: any) {
      logger.error("[MtlsSection] pickKeyChainCert failed:", err)
      setClientPickError(err?.message || t("mtls.err.readCert"))
    }
  }, [refresh])

  const handlePickFile = useCallback(async () => {
    setClientPickError(null)
    setPickNote(null)
    try {
      const b64 = await NativeLocationService.pickClientCertFile()
      if (!b64) return
      setImportState({ kind: "picked", b64, password: "", importing: false, error: null })
    } catch (err: any) {
      logger.error("[MtlsSection] pick failed:", err)
      setClientPickError(err?.message || t("mtls.err.readFile"))
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
      setImportState({ ...importState, importing: false, error: errMsg(CLIENT_CERT_ERR, err, "mtls.err.importFailed") })
    }
  }, [importState, refresh])

  const handleReplace = useCallback(async () => {
    const choice = await showChoice({
      title: t("mtls.replace.title"),
      message: t("mtls.replace.message"),
      buttons: [
        { text: t("mtls.replace.pick"), style: "primary" },
        { text: t("mtls.replace.import"), style: "secondary" },
        { text: t("common.cancel"), style: "secondary" }
      ]
    })
    if (choice === 0) handlePickKeyChain()
    else if (choice === 1) handlePickFile()
  }, [handlePickKeyChain, handlePickFile])

  const handleRemove = useCallback(async () => {
    const confirmed = await showConfirm({
      title: t("mtls.remove.title"),
      message: t("mtls.remove.message"),
      confirmText: t("common.remove"),
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
      <SectionTitle>{t("mtls.section.client")}</SectionTitle>
      <Card rows>
        {importState.kind === "picked" ? (
          <View style={styles.block}>
            <View>
              <TextField
                label={t("mtls.password")}
                testID="p12-password"
                value={importState.password}
                onChangeText={(v) => setImportState({ ...importState, password: v, error: null })}
                placeholder={t("mtls.password.placeholder")}
                autoCapitalize="none"
                autoCorrect={false}
                secure
                disabled={importState.importing}
                error={importState.error ?? undefined}
              />
              {!importState.error && <FieldMessage>{t("mtls.password.hint")}</FieldMessage>}
            </View>
            <View style={styles.buttonRow}>
              <Button
                style={styles.flex1}
                onPress={handleImport}
                title={t("mtls.import")}
                loading={importState.importing}
              />
              <Button
                variant="ghost"
                title={t("common.cancel")}
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
          <>
            <StateLine
              icon={ShieldCheck}
              iconColor={colors.textSecondary}
              label={t("mtls.none")}
              caption={t("mtls.client.none.caption")}
              testID="certificate-state"
            />
            <Divider tight />
            <ListItem
              testID="pick-keychain-row"
              icon={KeyRound}
              label={t("mtls.pick")}
              sub={t("mtls.pick.sub")}
              subLines={2}
              accessibilityHint={t("mtls.pick.hint")}
              onPress={handlePickKeyChain}
            />
            <Divider tight inset />
            <ListItem
              testID="import-p12-row"
              icon={FileKey}
              trailingIcon={Download}
              label={t("mtls.importP12")}
              sub={t("mtls.import.sub")}
              subLines={2}
              accessibilityHint={t("mtls.filePicker.hint")}
              onPress={handlePickFile}
            />
            {clientPickError ? (
              <View style={styles.rowError}>
                <FieldMessage variant="error">{clientPickError}</FieldMessage>
              </View>
            ) : pickNote ? (
              <View style={styles.rowError}>
                <FieldMessage>{pickNote}</FieldMessage>
              </View>
            ) : null}
          </>
        )}
      </Card>

      <SectionTitle style={styles.groupTop}>{t("mtls.section.ca")}</SectionTitle>
      <Card rows>
        {caInfo.configured ? (
          <CertificateCard
            state={describeCertificate(caInfo, undefined, "cert.failure.ca")}
            subject={caInfo.subject}
            onReplace={handlePickServerCa}
            onRemove={handleClearServerCa}
            removeTestID="remove-ca-btn"
            note={t("mtls.ca.note")}
          />
        ) : (
          <>
            <StateLine
              icon={ShieldCheck}
              iconColor={colors.textSecondary}
              label={t("mtls.none")}
              caption={t("mtls.ca.none.caption")}
              testID="ca-state"
            />
            <Divider tight />
            <ListItem
              testID="import-ca-row"
              icon={FileKey}
              trailingIcon={Download}
              label={t("mtls.importCa")}
              sub={t("mtls.importCa.sub")}
              subLines={2}
              accessibilityHint={t("mtls.filePicker.hint")}
              onPress={handlePickServerCa}
            />
            {caError ? (
              <View style={styles.rowError}>
                <FieldMessage variant="error">{caError}</FieldMessage>
              </View>
            ) : null}
          </>
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
  removeTestID,
  note
}: {
  state: CertificateState
  subject?: string
  issuer?: string
  onReplace: () => void
  onRemove: () => void
  removeTestID: string
  note?: string
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
        {subject ? <StatRow label={t("mtls.subject")} value={shortenDn(subject)} /> : null}
        {issuer ? <StatRow label={t("mtls.issuer")} value={shortenDn(issuer)} /> : null}
        {note ? <FieldMessage>{note}</FieldMessage> : null}
        <View style={styles.buttonRow}>
          <Button style={styles.flex1} variant="ghost" title={t("common.replace")} onPress={onReplace} />
          <Button
            style={styles.flex1}
            variant="danger"
            title={t("common.remove")}
            onPress={onRemove}
            testID={removeTestID}
          />
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
  rowError: {
    paddingBottom: space.lg
  },
  details: {
    paddingTop: space.md,
    paddingBottom: space.lg
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
