import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './dots_boxes.css'
import { DotsBoxes } from './DotsBoxes'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DotsBoxes />
  </StrictMode>,
)
