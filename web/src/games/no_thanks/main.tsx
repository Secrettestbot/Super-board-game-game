import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './no_thanks.css'
import { NoThanks } from './NoThanks'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NoThanks />
  </StrictMode>,
)
