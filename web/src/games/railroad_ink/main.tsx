import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './railroad_ink.css'
import { RailroadInk } from './RailroadInk'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RailroadInk />
  </StrictMode>,
)
