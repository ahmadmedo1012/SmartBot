import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
/* flip7.css intentionally removed — using SaaS default design system */
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
