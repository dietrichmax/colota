import { ApiTemplateName } from "../types/global"

/**
 * Resolves an ordered list of URLs to try for server health/reachability checks.
 * Each backend exposes connectivity differently - known endpoints are tried first,
 * with the origin root as a final fallback to confirm basic connectivity.
 */
export function resolveHealthUrls(endpoint: string, apiTemplate: ApiTemplateName): string[] {
  try {
    const origin = new URL(endpoint).origin

    switch (apiTemplate) {
      case "traccar": {
        // Prefer Traccar web API port; fall back to OsmAnd port (returns 400 but confirms reachability)
        const match = endpoint.match(/^(https?:\/\/[^/:]+)/)
        const host = match ? match[1] : origin
        return [`${host}:8082/api/server`, `${host}:8082`]
      }
      case "dawarich":
        return [`${origin}/api/v1/health`, origin]
      case "homeassistant":
        // HEAD request to the webhook URL itself to confirm reachability
        return [endpoint]
      case "owntracks":
        // /api/0/version for OwnTracks Recorder; Home Assistant responds at root if that 404s
        return [`${origin}/api/0/version`, origin]
      case "phonetrack":
        // PhoneTrack is a Nextcloud app - use Nextcloud's status endpoint
        return [`${origin}/status.php`, origin]
      case "geopulse":
      case "reitti":
      case "custom":
      default:
        return [`${origin}/health`, origin]
    }
  } catch {
    return [endpoint]
  }
}
