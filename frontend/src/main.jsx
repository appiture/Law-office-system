import React from 'react'
import ReactDOM from 'react-dom/client'
import { validateEnv } from './utils/envValidation'
validateEnv();
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from "@sentry/react"
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { PermissionsProvider } from './context/PermissionsContext'
import './index.css'

const sentryDsn = String(import.meta.env.VITE_SENTRY_DSN || "").trim()

if (sentryDsn && sentryDsn !== "YOUR_DSN") {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PermissionsProvider>
          <App />
        </PermissionsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
)




