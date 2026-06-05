import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './pong_hau_ki.css'
import { PongHauKi } from './PongHauKi'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PongHauKi />
  </StrictMode>,
)
