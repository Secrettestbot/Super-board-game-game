import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './ataxx.css'
import { Ataxx } from './Ataxx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Ataxx />
  </StrictMode>,
)
