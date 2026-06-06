import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './patchwork.css'
import { Patchwork } from './Patchwork'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Patchwork />
  </StrictMode>,
)
