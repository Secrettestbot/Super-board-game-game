import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './sushi_go.css'
import { SushiGo } from './SushiGo'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SushiGo />
  </StrictMode>,
)
