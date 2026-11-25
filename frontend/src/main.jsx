import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppPreloader } from '@/components/ui/AppPreloader'
// Lenis's own base styles, loaded before ours so the house rules below win.
import 'lenis/dist/lenis.css'
import './index.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container #root is missing from index.html')
}

// The router, not the browser, decides where a new page opens: every route
// change is reset to the top by `SmoothScroll`'s RouteScroll. Without this the
// native restorer can hand back the previous page's scroll offset and a page
// like /checkout paints at its footer.
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

createRoot(container).render(
  <StrictMode>
    <AppPreloader>
      <App />
    </AppPreloader>
  </StrictMode>,
)
