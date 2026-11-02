import React from 'react'
import ReactDOM from 'react-dom/client'
import { PlaybackModeProvider } from './context/PlaybackModeProvider'
import { ReaperBridgeProvider } from './context/ReaperBridgeProvider'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReaperBridgeProvider>
      <PlaybackModeProvider>
        <App />
      </PlaybackModeProvider>
    </ReaperBridgeProvider>
  </React.StrictMode>,
)
