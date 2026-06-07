import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './ur.css'
import { Ur } from './Ur'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Ur />
  </StrictMode>,
)
