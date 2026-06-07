import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './crew.css'
import { Crew } from './Crew'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crew />
  </StrictMode>,
)
