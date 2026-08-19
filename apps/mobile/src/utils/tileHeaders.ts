import { TransformRequestManager } from "@maplibre/maplibre-react-native"
import NativeLocationService from "../services/NativeLocationService"
import { REPO_URL } from "../constants"

/** App name and version only. The privacy policy commits to carrying no per-install identifier. */
export function tileServerUserAgent(): string {
  const version = NativeLocationService.getBuildConfig()?.VERSION_NAME ?? "dev"
  return `Colota/${version} (+${REPO_URL})`
}

/** Applies to the default tile server and any custom one. Call before the first map mounts. */
export function registerTileServerUserAgent(): void {
  TransformRequestManager.addHeader({
    id: "colota-user-agent",
    name: "User-Agent",
    value: tileServerUserAgent()
  })
}
