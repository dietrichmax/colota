import { useRef, useCallback, useEffect, useState } from "react"
import styles from "./ScreenshotGallery.module.css"

interface Screenshot {
  src: string
  label: string
}

interface ScreenshotGalleryProps {
  screenshots: Screenshot[]
}

export default function ScreenshotGallery({ screenshots }: ScreenshotGalleryProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  const open = useCallback((index: number) => {
    setActiveIndex(index)
    dialogRef.current?.showModal()
  }, [])

  const close = useCallback(() => {
    dialogRef.current?.close()
    setActiveIndex(-1)
  }, [])

  const prev = useCallback(() => {
    setActiveIndex((i) => (i > 0 ? i - 1 : screenshots.length - 1))
  }, [screenshots.length])

  const next = useCallback(() => {
    setActiveIndex((i) => (i < screenshots.length - 1 ? i + 1 : 0))
  }, [screenshots.length])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        prev()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        next()
      }
    }

    // Esc is handled natively by <dialog>, just reset state on close
    function onClose() {
      setActiveIndex(-1)
    }

    dialog.addEventListener("keydown", onKeyDown)
    dialog.addEventListener("close", onClose)
    return () => {
      dialog.removeEventListener("keydown", onKeyDown)
      dialog.removeEventListener("close", onClose)
    }
  }, [prev, next])

  const active = activeIndex >= 0 ? screenshots[activeIndex] : null

  return (
    <>
      <div className={styles.gallery}>
        {screenshots.map(({ src, label }, i) => (
          <figure key={label} className={styles.item} onClick={() => open(i)}>
            <img src={src} alt={label} loading="lazy" />
            <figcaption>{label}</figcaption>
          </figure>
        ))}
      </div>

      <dialog ref={dialogRef} className={styles.lightbox} onClick={close}>
        {active && (
          <div className={styles.lightboxInner} onClick={(e) => e.stopPropagation()}>
            {screenshots.length > 1 && (
              <button className={`${styles.navBtn} ${styles.navPrev}`} onClick={prev} aria-label="Previous">
                &#8249;
              </button>
            )}
            <img src={active.src} alt={active.label} />
            {screenshots.length > 1 && (
              <button className={`${styles.navBtn} ${styles.navNext}`} onClick={next} aria-label="Next">
                &#8250;
              </button>
            )}
            <div className={styles.caption}>
              {active.label}
              {screenshots.length > 1 && (
                <span className={styles.counter}>
                  {activeIndex + 1} / {screenshots.length}
                </span>
              )}
            </div>
            <button className={styles.closeBtn} onClick={close} aria-label="Close">
              &times;
            </button>
          </div>
        )}
      </dialog>
    </>
  )
}
