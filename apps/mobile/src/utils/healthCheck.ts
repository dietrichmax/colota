import { ApiTemplateName } from "../types/global"

// Returns URLs to try in order: known health path first, origin root as fallback.
export function resolveHealthUrls(endpoint: string, apiTemplate: ApiTemplateName): string[] {
  try {
    const origin = new URL(endpoint).origin

    switch (apiTemplate) {
      case "traccar": {
        // Traccar web API runs on port 8082 regardless of the OsmAnd ingest port (5055)
        const { protocol, hostname } = new URL(endpoint)
        const base = `${protocol}//${hostname}:8082`
        return [`${base}/api/server`, base]
      }
      case "dawarich":
        return [`${origin}/api/v1/health`, origin]
      case "owntracks":
        // /api/0/version for OwnTracks Recorder; Home Assistant responds at root if that 404s
        return [`${origin}/api/0/version`, origin]
      case "phonetrack":
        // PhoneTrack is a Nextcloud app - use Nextcloud's status endpoint
        return [`${origin}/status.php`, origin]
      case "geopulse":
        return [`${origin}/api/health`, origin]
      case "reitti":
      case "custom":
      // no UI yet for adding custom healthcheck endpoints; could be added once the server conenction settings get a own screen
      default:
        return [`${origin}/health`, origin]
    }
  } catch {
    return [endpoint]
  }
}
