import { type ReactNode, useRef } from "react"
import clsx from "clsx"
import Link from "@docusaurus/Link"
import Layout from "@theme/Layout"
import Heading from "@theme/Heading"

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
      "No cloud, no analytics, no telemetry. Send data to Dawarich, OwnTracks, Home Assistant, Traccar, or any HTTP backend."
  },
  {
    title: "Works Offline",
    description:
      "Locations queue locally and sync when connectivity returns. Export anytime as CSV, GeoJSON, GPX, or KML."
  },
  {
    title: "Tracking Profiles",
    description: "Multiple GPS configs that switch automatically based on charging state, Android Auto, or speed."
  },
  {
    title: "Maps & Geofencing",
    description: "Native maps with speed-colored tracks. Define pause zones to stop tracking at home or work."
  }
]

function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {features.map(({ title, description }, idx) => (
            <div key={idx} className="col col--3" style={{ marginBottom: "1.5rem" }}>
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

function HomepageScreenshots(): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const screenshots = [
    { src: "/img/screenshots/Dashboard.png", label: "Dashboard" },
    { src: "/img/screenshots/Settings.png", label: "Settings" },
    { src: "/img/screenshots/TrackingProfiles.png", label: "Tracking Profiles" },
    { src: "/img/screenshots/DataManagement.png", label: "Data Management" },
    { src: "/img/screenshots/ApiFieldMapping.png", label: "API Field Mapping" },
    { src: "/img/screenshots/ExportData.png", label: "Export" },
    { src: "/img/screenshots/Authentication.png", label: "Authentication" },
    { src: "/img/screenshots/DarkMode.png", label: "Dark Mode" }
  ]

  function openLightbox(src: string, alt: string) {
    if (imgRef.current) {
      imgRef.current.src = src
      imgRef.current.alt = alt
    }
    dialogRef.current?.showModal()
  }

  return (
    <section className={styles.screenshots}>
      <div className="container">
        <Heading as="h2" className={styles.sectionHeading}>
          Screenshots
        </Heading>
        <div className={styles.screenshotStrip}>
          {screenshots.map(({ src, label }) => (
            <figure key={label} className={styles.screenshotItem} onClick={() => openLightbox(src, label)}>
              <img src={src} alt={label} loading="lazy" />
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <dialog ref={dialogRef} className={styles.lightbox} onClick={() => dialogRef.current?.close()}>
        <img ref={imgRef} src="" alt="" />
      </dialog>
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
