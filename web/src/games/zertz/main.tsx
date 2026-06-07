import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './zertz.css'
import { Zertz } from './Zertz'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Zertz />
  </StrictMode>,
)
