import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './yote.css'
import { Yote } from './Yote'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Yote />
  </StrictMode>,
)
