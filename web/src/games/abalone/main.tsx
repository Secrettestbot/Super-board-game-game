import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './abalone.css'
import { Abalone } from './Abalone'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Abalone />
  </StrictMode>,
)
