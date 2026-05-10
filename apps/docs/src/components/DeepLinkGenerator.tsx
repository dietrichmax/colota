import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import styles from "./DeepLinkGenerator.module.css"

interface KeyValue {
  key: string
  value: string
}

interface GeofenceRow {
  name: string
  lat: string
  lon: string
  radius: string
  pauseTracking: boolean
  pauseOnWifi: boolean
  pauseOnMotionless: boolean
  motionlessTimeoutMinutes: string
  heartbeatEnabled: boolean
  heartbeatIntervalMinutes: string
}

const API_TEMPLATES = [
  "custom",
  "dawarich",
  "geopulse",
  "overland",
  "owntracks",
  "phonetrack",
  "reitti",
  "traccar"
] as const
const AUTH_TYPES = ["none", "basic", "bearer"] as const
const SYNC_CONDITIONS = ["any", "wifi_any", "wifi_ssid", "vpn"] as const

const DAWARICH_MODES = ["single", "batch"] as const

export default function DeepLinkGenerator() {
  // Connection
  const [endpoint, setEndpoint] = useState("")
  const [apiTemplate, setApiTemplate] = useState("")
  const [httpMethod, setHttpMethod] = useState("")
  const [dawarichMode, setDawarichMode] = useState("")
  const [overlandBatchSize, setOverlandBatchSize] = useState("")

  // Tracking
  const [interval, setInterval_] = useState("")
  const [distance, setDistance] = useState("")
  const [accuracyThreshold, setAccuracyThreshold] = useState("")
  const [filterInaccurateLocations, setFilterInaccurateLocations] = useState("")

  // Sync
  const [syncInterval, setSyncInterval] = useState("")
  const [isOfflineMode, setIsOfflineMode] = useState("")
  const [syncCondition, setSyncCondition] = useState("")
  const [syncSsid, setSyncSsid] = useState("")

  // Auth
  const [authType, setAuthType] = useState("")
  const [authUsername, setAuthUsername] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authBearerToken, setAuthBearerToken] = useState("")

  // Field map
  const [fieldMapEntries, setFieldMapEntries] = useState<KeyValue[]>([])

  // Custom fields
  const [customFields, setCustomFields] = useState<KeyValue[]>([])

  // Custom headers
  const [customHeaders, setCustomHeaders] = useState<KeyValue[]>([])

  // Geofences
  const [geofences, setGeofences] = useState<GeofenceRow[]>([])

  // QR
  const qrRef = useRef<HTMLDivElement>(null)
  const [qrLib, setQrLib] = useState<any>(null)

  useEffect(() => {
    import("qrcode").then((mod) => setQrLib(mod.default || mod)).catch(() => {})
  }, [])

  const config = useMemo(() => {
    const obj: Record<string, unknown> = {}

    if (endpoint) obj.endpoint = endpoint
    if (apiTemplate) obj.apiTemplate = apiTemplate
    if (httpMethod) obj.httpMethod = httpMethod
    if (dawarichMode) obj.dawarichMode = dawarichMode
    if (overlandBatchSize && Number(overlandBatchSize) > 0) obj.overlandBatchSize = Number(overlandBatchSize)

    if (interval) obj.interval = Number(interval)
    if (distance) obj.distance = Number(distance)
    if (accuracyThreshold) obj.accuracyThreshold = Number(accuracyThreshold)
    if (filterInaccurateLocations) obj.filterInaccurateLocations = filterInaccurateLocations === "true"

    if (syncInterval) obj.syncInterval = Number(syncInterval)
    if (isOfflineMode) obj.isOfflineMode = isOfflineMode === "true"
    if (syncCondition) obj.syncCondition = syncCondition
    if (syncSsid) obj.syncSsid = syncSsid

    if (authType && authType !== "none") {
      const auth: Record<string, string> = { type: authType }
      if (authType === "basic") {
        if (authUsername) auth.username = authUsername
        if (authPassword) auth.password = authPassword
      } else if (authType === "bearer") {
        if (authBearerToken) auth.bearerToken = authBearerToken
      }
      obj.auth = auth
    } else if (authType === "none") {
      obj.auth = { type: "none" }
    }

    const fm: Record<string, string> = {}
    for (const e of fieldMapEntries) {
      if (e.key && e.value) fm[e.key] = e.value
    }
    if (Object.keys(fm).length > 0) obj.fieldMap = fm

    const cf = customFields.filter((e) => e.key && e.value)
    if (cf.length > 0) obj.customFields = cf

    const ch: Record<string, string> = {}
    for (const e of customHeaders) {
      if (e.key && e.value) ch[e.key] = e.value
    }
    if (Object.keys(ch).length > 0) obj.customHeaders = ch

    const gfs = geofences
      .filter((g) => g.name && g.lat && g.lon && g.radius && Number(g.radius) > 0)
      .map((g) => {
        const entry: Record<string, unknown> = {
          name: g.name,
          lat: Number(g.lat),
          lon: Number(g.lon),
          radius: Number(g.radius)
        }
        if (g.pauseTracking) entry.pauseTracking = true
        if (g.pauseOnWifi) entry.pauseOnWifi = true
        if (g.pauseOnMotionless) {
          entry.pauseOnMotionless = true
          if (g.motionlessTimeoutMinutes && Number(g.motionlessTimeoutMinutes) > 0) {
            entry.motionlessTimeoutMinutes = Number(g.motionlessTimeoutMinutes)
          }
        }
        if (g.heartbeatEnabled) {
          entry.heartbeatEnabled = true
          if (g.heartbeatIntervalMinutes && Number(g.heartbeatIntervalMinutes) > 0) {
            entry.heartbeatIntervalMinutes = Number(g.heartbeatIntervalMinutes)
          }
        }
        return entry
      })
    if (gfs.length > 0) obj.geofences = gfs

    return obj
  }, [
    endpoint,
    apiTemplate,
    httpMethod,
    dawarichMode,
    overlandBatchSize,
    interval,
    distance,
    accuracyThreshold,
    filterInaccurateLocations,
    syncInterval,
    isOfflineMode,
    syncCondition,
    syncSsid,
    authType,
    authUsername,
    authPassword,
    authBearerToken,
    fieldMapEntries,
    customFields,
    customHeaders,
    geofences
  ])

  const isEmpty = Object.keys(config).length === 0

  const deepLink = useMemo(() => {
    if (isEmpty) return ""
    const encoded = btoa(JSON.stringify(config))
    return `colota://setup?config=${encoded}`
  }, [config, isEmpty])

  // QR code rendering
  useEffect(() => {
    if (!qrRef.current || !qrLib || !deepLink) {
      if (qrRef.current) qrRef.current.innerHTML = ""
      return
    }

    const canvas = document.createElement("canvas")
    qrLib.toCanvas(canvas, deepLink, { width: 200, margin: 2 }, (err: Error | null) => {
      if (!err && qrRef.current) {
        qrRef.current.innerHTML = ""
        qrRef.current.appendChild(canvas)
      }
    })
  }, [deepLink, qrLib])

  const [copyFeedback, setCopyFeedback] = useState(false)
  const [downloadFeedback, setDownloadFeedback] = useState(false)

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(deepLink)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }, [deepLink])

  const downloadJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "colota-config.json"
    a.click()
    URL.revokeObjectURL(url)
    setDownloadFeedback(true)
    setTimeout(() => setDownloadFeedback(false), 2000)
  }, [config])

  const updateKV = (
    list: KeyValue[],
    setList: (v: KeyValue[]) => void,
    index: number,
    field: "key" | "value",
    val: string
  ) => {
    const next = [...list]
    next[index] = { ...next[index], [field]: val }
    setList(next)
  }

  const removeKV = (list: KeyValue[], setList: (v: KeyValue[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index))
  }

  const updateGeofence = <K extends keyof GeofenceRow>(index: number, field: K, val: GeofenceRow[K]) => {
    const next = [...geofences]
    next[index] = { ...next[index], [field]: val }
    setGeofences(next)
  }

  const removeGeofence = (index: number) => {
    setGeofences(geofences.filter((_, i) => i !== index))
  }

  const addGeofence = () => {
    setGeofences([
      ...geofences,
      {
        name: "",
        lat: "",
        lon: "",
        radius: "",
        pauseTracking: true,
        pauseOnWifi: false,
        pauseOnMotionless: false,
        motionlessTimeoutMinutes: "",
        heartbeatEnabled: false,
        heartbeatIntervalMinutes: ""
      }
    ])
  }

  return (
    <div className={styles.generator}>
      {/* Connection */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Connection</div>
        <div className={styles.field}>
          <label className={styles.label}>Endpoint URL</label>
          <input
            className={styles.input}
            type="url"
            placeholder="https://my-server.com/api/locations"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
          />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>API Template</label>
            <select className={styles.select} value={apiTemplate} onChange={(e) => setApiTemplate(e.target.value)}>
              <option value="">-- not set --</option>
              {API_TEMPLATES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>HTTP Method</label>
            <select className={styles.select} value={httpMethod} onChange={(e) => setHttpMethod(e.target.value)}>
              <option value="">-- not set --</option>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </div>
        </div>
        {apiTemplate === "dawarich" && (
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Dawarich Mode</label>
              <select className={styles.select} value={dawarichMode} onChange={(e) => setDawarichMode(e.target.value)}>
                <option value="">-- not set --</option>
                {DAWARICH_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {(apiTemplate === "overland" || (apiTemplate === "dawarich" && dawarichMode === "batch")) && (
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Batch size (1-500)</label>
              <input
                className={styles.input}
                type="number"
                min="1"
                max="500"
                placeholder="50"
                value={overlandBatchSize}
                onChange={(e) => setOverlandBatchSize(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tracking */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Tracking</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Interval (seconds)</label>
            <input
              className={styles.input}
              type="number"
              min="1"
              placeholder="e.g. 10"
              value={interval}
              onChange={(e) => setInterval_(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Distance (meters)</label>
            <input
              className={styles.input}
              type="number"
              min="0"
              placeholder="e.g. 5"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Accuracy threshold (meters)</label>
            <input
              className={styles.input}
              type="number"
              min="0"
              placeholder="e.g. 50"
              value={accuracyThreshold}
              onChange={(e) => setAccuracyThreshold(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Filter inaccurate locations</label>
            <select
              className={styles.select}
              value={filterInaccurateLocations}
              onChange={(e) => setFilterInaccurateLocations(e.target.value)}
            >
              <option value="">-- not set --</option>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Sync */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Sync</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Sync interval (seconds)</label>
            <input
              className={styles.input}
              type="number"
              min="0"
              placeholder="0 = instant"
              value={syncInterval}
              onChange={(e) => setSyncInterval(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Offline mode</label>
            <select className={styles.select} value={isOfflineMode} onChange={(e) => setIsOfflineMode(e.target.value)}>
              <option value="">-- not set --</option>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Sync condition</label>
            <select className={styles.select} value={syncCondition} onChange={(e) => setSyncCondition(e.target.value)}>
              <option value="">-- not set --</option>
              {SYNC_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {syncCondition === "wifi_ssid" && (
            <div className={styles.field}>
              <label className={styles.label}>Wi-Fi SSID</label>
              <input
                className={styles.input}
                placeholder="MyNetwork"
                value={syncSsid}
                onChange={(e) => setSyncSsid(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Auth */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Authentication</div>
        <div className={styles.field}>
          <label className={styles.label}>Auth type</label>
          <select className={styles.select} value={authType} onChange={(e) => setAuthType(e.target.value)}>
            <option value="">-- not set --</option>
            {AUTH_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {authType === "basic" && (
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Username</label>
              <input className={styles.input} value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                className={styles.input}
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </div>
          </div>
        )}
        {authType === "bearer" && (
          <div className={styles.field}>
            <label className={styles.label}>Bearer token</label>
            <input
              className={styles.input}
              type="password"
              placeholder="my-secret-token"
              value={authBearerToken}
              onChange={(e) => setAuthBearerToken(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Custom Headers */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Custom Headers</div>
        <div className={styles.keyValueList}>
          {customHeaders.map((entry, i) => (
            <div key={i} className={styles.keyValueRow}>
              <input
                className={styles.input}
                placeholder="Header name"
                value={entry.key}
                onChange={(e) => updateKV(customHeaders, setCustomHeaders, i, "key", e.target.value)}
              />
              <input
                className={styles.input}
                placeholder="Value"
                value={entry.value}
                onChange={(e) => updateKV(customHeaders, setCustomHeaders, i, "value", e.target.value)}
              />
              <button className={styles.removeBtn} onClick={() => removeKV(customHeaders, setCustomHeaders, i)}>
                x
              </button>
            </div>
          ))}
        </div>
        <button className={styles.addBtn} onClick={() => setCustomHeaders([...customHeaders, { key: "", value: "" }])}>
          + Add header
        </button>
      </div>

      {/* Custom Fields */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Custom Fields</div>
        <div className={styles.keyValueList}>
          {customFields.map((entry, i) => (
            <div key={i} className={styles.keyValueRow}>
              <input
                className={styles.input}
                placeholder="Key"
                value={entry.key}
                onChange={(e) => updateKV(customFields, setCustomFields, i, "key", e.target.value)}
              />
              <input
                className={styles.input}
                placeholder="Value"
                value={entry.value}
                onChange={(e) => updateKV(customFields, setCustomFields, i, "value", e.target.value)}
              />
              <button className={styles.removeBtn} onClick={() => removeKV(customFields, setCustomFields, i)}>
                x
              </button>
            </div>
          ))}
        </div>
        <button className={styles.addBtn} onClick={() => setCustomFields([...customFields, { key: "", value: "" }])}>
          + Add field
        </button>
      </div>

      {/* Field Map */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Field Map</div>
        <div className={styles.keyValueList}>
          {fieldMapEntries.map((entry, i) => (
            <div key={i} className={styles.keyValueRow}>
              <input
                className={styles.input}
                placeholder="Source field (e.g. lat)"
                value={entry.key}
                onChange={(e) => updateKV(fieldMapEntries, setFieldMapEntries, i, "key", e.target.value)}
              />
              <input
                className={styles.input}
                placeholder="Mapped name"
                value={entry.value}
                onChange={(e) => updateKV(fieldMapEntries, setFieldMapEntries, i, "value", e.target.value)}
              />
              <button className={styles.removeBtn} onClick={() => removeKV(fieldMapEntries, setFieldMapEntries, i)}>
                x
              </button>
            </div>
          ))}
        </div>
        <button
          className={styles.addBtn}
          onClick={() => setFieldMapEntries([...fieldMapEntries, { key: "", value: "" }])}
        >
          + Add mapping
        </button>
      </div>

      {/* Geofences */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Geofences</div>
        <div className={styles.keyValueList}>
          {geofences.map((g, i) => (
            <div key={i} className={styles.geofenceCard}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Name</label>
                  <input
                    className={styles.input}
                    placeholder="Home"
                    value={g.name}
                    onChange={(e) => updateGeofence(i, "name", e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Radius (m)</label>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    placeholder="100"
                    value={g.radius}
                    onChange={(e) => updateGeofence(i, "radius", e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Latitude</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="any"
                    placeholder="52.52"
                    value={g.lat}
                    onChange={(e) => updateGeofence(i, "lat", e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Longitude</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="any"
                    placeholder="13.405"
                    value={g.lon}
                    onChange={(e) => updateGeofence(i, "lon", e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.geofenceFlags}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={g.pauseTracking}
                    onChange={(e) => updateGeofence(i, "pauseTracking", e.target.checked)}
                  />
                  Pause tracking
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={g.pauseOnWifi}
                    onChange={(e) => updateGeofence(i, "pauseOnWifi", e.target.checked)}
                  />
                  Pause on Wi-Fi
                </label>
              </div>
              <div className={styles.conditionalRow}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={g.pauseOnMotionless}
                    onChange={(e) => updateGeofence(i, "pauseOnMotionless", e.target.checked)}
                  />
                  Pause when motionless
                </label>
                <input
                  className={`${styles.input} ${!g.pauseOnMotionless ? styles.hidden : ""}`}
                  type="number"
                  min="1"
                  placeholder="Timeout in min (default 10)"
                  value={g.motionlessTimeoutMinutes}
                  onChange={(e) => updateGeofence(i, "motionlessTimeoutMinutes", e.target.value)}
                  aria-hidden={!g.pauseOnMotionless}
                  tabIndex={g.pauseOnMotionless ? 0 : -1}
                />
              </div>
              <div className={styles.conditionalRow}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={g.heartbeatEnabled}
                    onChange={(e) => updateGeofence(i, "heartbeatEnabled", e.target.checked)}
                  />
                  Stationary heartbeat
                </label>
                <input
                  className={`${styles.input} ${!g.heartbeatEnabled ? styles.hidden : ""}`}
                  type="number"
                  min="1"
                  placeholder="Interval in min (default 15)"
                  value={g.heartbeatIntervalMinutes}
                  onChange={(e) => updateGeofence(i, "heartbeatIntervalMinutes", e.target.value)}
                  aria-hidden={!g.heartbeatEnabled}
                  tabIndex={g.heartbeatEnabled ? 0 : -1}
                />
              </div>
              <div className={styles.geofenceActions}>
                <button className={styles.removeBtn} onClick={() => removeGeofence(i)}>
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
        <button className={styles.addBtn} onClick={addGeofence}>
          + Add geofence
        </button>
      </div>

      {/* Output */}
      <hr className={styles.divider} />

      {isEmpty ? (
        <p className={styles.empty}>Fill in at least one field above to generate a setup link.</p>
      ) : (
        <>
          <div className={styles.sectionTitle}>Generated Link</div>
          <div className={styles.output}>{deepLink}</div>

          <div className={styles.actions}>
            <button className={styles.copyBtn} onClick={copyLink}>
              {copyFeedback ? "Copied!" : "Copy link"}
            </button>
            <button className={styles.downloadBtn} onClick={downloadJson}>
              {downloadFeedback ? "Downloaded!" : "Download JSON"}
            </button>
          </div>

          {qrLib && (
            <>
              <div className={styles.sectionTitle} style={{ marginTop: "1rem" }}>
                QR Code
              </div>
              <div className={styles.qrContainer} ref={qrRef} />
            </>
          )}
        </>
      )}
    </div>
  )
}
