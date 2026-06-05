import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './amazons.css'
import { Amazons } from './Amazons'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Amazons />
  </StrictMode>,
)
