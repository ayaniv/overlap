import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { analytics } from './analytics/analytics'
import { AnalyticsProvider } from './analytics/AnalyticsProvider'
import { logger } from './logger/logger'
import { LoggerProvider } from './logger/LoggerProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnalyticsProvider service={analytics}>
      <LoggerProvider service={logger}>
        <App />
      </LoggerProvider>
    </AnalyticsProvider>
  </StrictMode>,
)
