import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './lines_of_action.css'
import { LinesOfAction } from './LinesOfAction'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LinesOfAction />
  </StrictMode>,
)
