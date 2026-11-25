import { useState, useEffect } from 'react'

/**
 * Preload high-priority static and dynamic images.
 */
function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.src = src
    if (img.complete) {
      resolve(src)
    } else {
      img.onload = () => resolve(src)
      img.onerror = () => resolve(src) // Don't block indefinitely on missing images
    }
  })
}

/**
 * Global AppPreloader
 * Ensures luxury hero images, background textures, fonts, and store hydration
 * are 100% ready before unveiling the website.
 */
export function AppPreloader({ children }) {
  const [ready, setReady] = useState(false)
  const [fadeComplete, setFadeComplete] = useState(false)

  useEffect(() => {
    const criticalImages = [
      '/hero-white.jpg?v=5',
      '/studio.png',
      '/offer-white.jpg?v=3',
      '/compose.png',
      '/pillar-originals.jpg?v=4',
      '/pillar-inspired.jpg?v=4',
      '/pillar-attars.jpg?v=4',
      '/pillar-combos.jpg?v=4',
      '/pillar-bakhoor.jpg?v=3',
    ]

    const startTime = Date.now()

    // 1. Preload key critical hero & background images
    const imagePromises = criticalImages.map(preloadImage)

    // 2. Wait for web fonts (Poppins)
    const fontPromise = document.fonts ? document.fonts.ready : Promise.resolve()

    Promise.all([...imagePromises, fontPromise]).then(() => {
      // Ensure at least a smooth 350ms experience so there is no micro-flicker
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 350 - elapsed)

      setTimeout(() => {
        setReady(true)
        // Remove preloader DOM element after smooth fade-out animation
        setTimeout(() => setFadeComplete(true), 600)
      }, remaining)
    })
  }, [])

  return (
    <>
      {/* Real Website content (mounted and rendered in background so styles & layouts calculate) */}
      <div
        className={`transition-opacity duration-700 ease-out ${ready ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
      >
        {children}
      </div>

      {/* Haute Parfumerie Luxury Preloader Screen */}
      {!fadeComplete && (
        <div
          aria-hidden="true"
          className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#11100F] text-white transition-opacity duration-600 ease-in-out ${ready ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
        >
          {/* Subtle warm glow background */}
          <div
            className="pointer-events-none absolute h-96 w-96 rounded-full blur-3xl opacity-20"
            style={{
              background: 'radial-gradient(circle, #D8B878 0%, transparent 70%)',
            }}
          />

          <div className="relative z-10 flex flex-col items-center text-center px-4">
            <img
              src="/logo.png"
              alt="Raheman Perfumes"
              draggable={false}
              loading="eager"
              className="h-28 w-28 sm:h-36 sm:w-36 rounded-full object-contain drop-shadow-[0_0_24px_rgba(216,184,120,0.35)] animate-pulse"
            />

            {/* Elegant loading bar */}
            <div className="mt-8 h-[2px] w-36 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-full bg-[#D8B878] origin-left animate-[shimmer_1.5s_infinite_ease-in-out]" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

