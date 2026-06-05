import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './carnac.css'
import { Carnac } from './Carnac'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Carnac />
  </StrictMode>,
)
