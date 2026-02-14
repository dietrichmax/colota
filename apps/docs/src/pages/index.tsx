import type { ReactNode } from "react"
import clsx from "clsx"
import Link from "@docusaurus/Link"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import Layout from "@theme/Layout"
import Heading from "@theme/Heading"

import styles from "./index.module.css"

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext()
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/introduction">
            Get Started
          </Link>
          <Link
            className="button button--outline button--lg"
            style={{ color: "white", borderColor: "white", marginLeft: "1rem" }}
            href="https://play.google.com/store/apps/details?id=com.Colota&hl=en-US"
          >
            Google Play
          </Link>
        </div>
      </div>
    </header>
  )
}

const features = [
  {
    title: "Self-Hosted",
    description:
      "Send location data to your own server over HTTPS. No cloud services, no third-party calls. Works with Dawarich, OwnTracks, Reitti, or any custom backend."
  },
  {
    title: "Privacy First",
    description:
      "No analytics, no telemetry, no advertising IDs. All data stays on your device or your server. Open source under AGPL-3.0."
  },
  {
    title: "Works Offline",
    description: "Works without a server. Store location history locally and export as CSV, GeoJSON, GPX, or KML."
  },
  {
    title: "Background Tracking",
    description:
      "Foreground service, auto-start on boot, retry with exponential backoff, and battery-critical shutdown."
  },
  {
    title: "Geofencing",
    description:
      "Create zones where tracking pauses automatically. Saves battery at home, work, or other regular stops."
  },
  {
    title: "Sync Modes",
    description:
      "Instant, batch, or offline sync. Configurable intervals, exponential backoff, and auto-sync on reconnect."
  }
]

function HomepageFeatures(): ReactNode {
  return (
    <section style={{ padding: "2rem 0" }}>
      <div className="container">
        <div className="row">
          {features.map(({ title, description }, idx) => (
            <div key={idx} className="col col--4" style={{ marginBottom: "1.5rem" }}>
              <div className="feature-card">
                <Heading as="h3">{title}</Heading>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HomepageScreenshots(): ReactNode {
  const screenshots = [
    { src: "/img/screenshots/Dashboard.png", label: "Dashboard" },
    { src: "/img/screenshots/Settings.png", label: "Settings" },
    { src: "/img/screenshots/Geofences.png", label: "Geofences" },
    { src: "/img/screenshots/DataManagement.png", label: "Data Management" },
    { src: "/img/screenshots/ExportData.png", label: "Export Data" },
    { src: "/img/screenshots/ApiFieldMapping.png", label: "API Field Mapping" },
    { src: "/img/screenshots/Authentication.png", label: "Authentication" },
    { src: "/img/screenshots/DarkMode.png", label: "Dark Mode" }
  ]

  return (
    <section style={{ padding: "2rem 0" }}>
      <div className="container">
        <Heading as="h2" style={{ textAlign: "center", marginBottom: "1rem" }}>
          Screenshots
        </Heading>
        <div className="screenshot-gallery">
          {screenshots.map(({ src, label }) => (
            <figure key={label}>
              <img src={src} alt={label} loading="lazy" />
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Self-hosted GPS Tracking for Android"
      description="Colota is a self-hosted GPS tracking app for Android. Send your location to your own server, work offline, and keep your data private."
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <HomepageScreenshots />
      </main>
    </Layout>
  )
}
