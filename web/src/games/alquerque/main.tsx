import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './alquerque.css'
import { Alquerque } from './Alquerque'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Alquerque />
  </StrictMode>,
)
