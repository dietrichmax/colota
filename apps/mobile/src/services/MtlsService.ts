/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { NativeModules } from "react-native"
import {
  ClientCertInfo,
  ClientCertInfoResult,
  KeyChainPickResult,
  TestEndpointArgs,
  TestEndpointResult
} from "../types/global"

const { MtlsBridgeModule } = NativeModules

class MtlsService {
  private static ensureModule(): void {
    if (!MtlsBridgeModule) {
      throw new Error("[MtlsService] MtlsBridgeModule not available. Check native linking.")
    }
  }

  static async pickClientCertFile(): Promise<string | null> {
    this.ensureModule()
    return MtlsBridgeModule.pickClientCertFile()
  }

  /**
   * Opens Android's system KeyChain picker. Returns cert info on selection,
   * null on cancel. The private key stays in the OS keystore.
   */
  static async pickKeyChainCert(): Promise<KeyChainPickResult | null> {
    this.ensureModule()
    return MtlsBridgeModule.pickKeyChainCert()
  }

  /**
   * Rejects with `E_CERT_PASSWORD` on a bad password or `E_CERT_INVALID` on a
   * malformed PKCS12.
   */
  static async importClientCert(b64: string, password: string): Promise<ClientCertInfo> {
    this.ensureModule()
    return MtlsBridgeModule.importClientCert(b64, password)
  }

  static async clearClientCert(): Promise<boolean> {
    this.ensureModule()
    return MtlsBridgeModule.clearClientCert()
  }

  static async getClientCertInfo(): Promise<ClientCertInfoResult> {
    this.ensureModule()
    return MtlsBridgeModule.getClientCertInfo()
  }

  static async testEndpoint(args: TestEndpointArgs): Promise<TestEndpointResult> {
    this.ensureModule()
    return MtlsBridgeModule.testEndpoint(args)
  }

  static async pickServerCaFile(): Promise<string | null> {
    this.ensureModule()
    return MtlsBridgeModule.pickServerCaFile()
  }

  /** Rejects with `E_CA_INVALID` if the bytes don't parse as X.509 (PEM or DER). */
  static async importServerCa(b64: string): Promise<ClientCertInfo> {
    this.ensureModule()
    return MtlsBridgeModule.importServerCa(b64)
  }

  static async clearServerCa(): Promise<boolean> {
    this.ensureModule()
    return MtlsBridgeModule.clearServerCa()
  }

  static async getServerCaInfo(): Promise<ClientCertInfoResult> {
    this.ensureModule()
    return MtlsBridgeModule.getServerCaInfo()
  }
}

export default MtlsService
