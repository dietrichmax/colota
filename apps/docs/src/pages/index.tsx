import { type ReactNode } from "react"
import clsx from "clsx"
import Link from "@docusaurus/Link"
import Layout from "@theme/Layout"
import Heading from "@theme/Heading"
import ScreenshotGallery from "../components/ScreenshotGallery"

import styles from "./index.module.css"

function HomepageHeader() {
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className={clsx("container", styles.heroInner)}>
        <div className={styles.heroText}>
          <Heading as="h1" className="hero__title">
            Colota
          </Heading>
          <p className={styles.heroSubtitle}>
            Self-hosted GPS tracking for Android.
            <br />
            Your data, your server, your rules.
          </p>
          <div className={styles.buttons}>
            <Link className="button button--secondary button--lg" to="/docs/introduction">
              Get Started
            </Link>
            <Link
              className={clsx("button button--lg", styles.outlineButton)}
              href="https://play.google.com/store/apps/details?id=com.Colota&hl=en-US"
            >
              Google Play
            </Link>
          </div>
          <div className={styles.downloadLinks}>
            <span className={styles.downloadLabel}>Also available on</span>
            <Link className={styles.downloadLink} href="https://f-droid.org/packages/com.Colota/">
              F-Droid
            </Link>{" "}
            and
            <Link className={styles.downloadLink} href="https://apt.izzysoft.de/fdroid/index/apk/com.Colota">
              IzzyOnDroid
            </Link>
          </div>
        </div>
        <div className={styles.heroScreenshot}>
          <img src="/img/screenshots/Dashboard.png" alt="Colota Dashboard" />
        </div>
      </div>
    </header>
  )
}

const features = [
  {
    title: "Self-Hosted & Private",
    description:
      "No cloud, no analytics, no telemetry. Send data to your own server or any HTTP/S backend. Open source under AGPL-3.0."
  },
  {
    title: "Works Offline",
    description:
      "Locations queue locally and sync when connectivity returns. Download map areas for offline use. Export as CSV, GeoJSON, GPX, or KML."
  },
  {
    title: "Location History",
    description:
      "Trip segmentation with speed-colored tracks, elevation profiles, and stats. Calendar view with activity dots and per-trip export."
  },
  {
    title: "Tracking Profiles",
    description:
      "Multiple GPS configs that switch automatically based on charging state, Android Auto, speed or stationary detection."
  },
  {
    title: "Maps & Geofencing",
    description:
      "GPU-accelerated live tracking map. Define pause zones to automatically stop recording at home or work."
  },
  {
    title: "Flexible Sync",
    description:
      "Instant, batched, Wi-Fi only, or fully offline. Scheduled auto-export to a local directory with configurable format and retention."
  }
]

function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {features.map(({ title, description }, idx) => (
            <div key={idx} className="col col--4" style={{ marginBottom: "1.5rem" }}>
              <div className={styles.featureCard}>
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

const homepageScreenshots = [
  { src: "/img/screenshots/Dashboard.png", label: "Dashboard" },
  { src: "/img/screenshots/Geofences.png", label: "Geofences" },
  { src: "/img/screenshots/LocationHistory.png", label: "Location History" },
  { src: "/img/screenshots/TrackingProfiles.png", label: "Profile Editor" },
  { src: "/img/screenshots/DarkMode.png", label: "Dark Mode" }
]

const integrations = [
  { label: "Dawarich", to: "/docs/integrations/dawarich" },
  { label: "OwnTracks", to: "/docs/integrations/owntracks" },
  { label: "Home Assistant", to: "/docs/integrations/home-assistant" },
  { label: "Traccar", to: "/docs/integrations/traccar" },
  { label: "GeoPulse", to: "/docs/integrations/geopulse" },
  { label: "PhoneTrack", to: "/docs/integrations/phonetrack" },
  { label: "Reitti", to: "/docs/integrations/reitti" },
  { label: "Custom Backend", to: "/docs/integrations/custom-backend" }
]

function HomepageIntegrations(): ReactNode {
  return (
    <section className={styles.integrations}>
      <div className="container">
        <p className={styles.integrationsLabel}>Works with</p>
        <div className={styles.integrationsList}>
          {integrations.map(({ label, to }) => (
            <Link key={label} to={to} className={styles.integrationBadge}>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function HomepageScreenshots(): ReactNode {
  return (
    <section className={styles.screenshots}>
      <div className="container">
        <Heading as="h2" className={styles.sectionHeading}>
          Screenshots
        </Heading>
        <ScreenshotGallery screenshots={homepageScreenshots} />
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
        <HomepageIntegrations />
        <HomepageScreenshots />
      </main>
    </Layout>
  )
}
