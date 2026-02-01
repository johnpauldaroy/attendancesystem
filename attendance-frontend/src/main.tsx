import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import coopLogo from './assets/COOP LOGO.jpg'

document.title = 'Barbaza MPC Attendance System'

const faviconEl = document.querySelector<HTMLLinkElement>('link[rel*="icon"]') ?? (() => {
  const el = document.createElement('link')
  el.setAttribute('rel', 'icon')
  document.head.appendChild(el)
  return el
})()
faviconEl.type = 'image/jpeg'
faviconEl.href = coopLogo

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
