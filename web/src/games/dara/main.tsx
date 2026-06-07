import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './dara.css'
import { Dara } from './Dara'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Dara />
  </StrictMode>,
)
