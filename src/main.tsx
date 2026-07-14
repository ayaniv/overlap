import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AnalyticsProvider } from './analytics/AnalyticsProvider'
import { LoggerProvider } from './logger/LoggerProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnalyticsProvider>
      <LoggerProvider>
        <App />
      </LoggerProvider>
    </AnalyticsProvider>
  </StrictMode>,
)
