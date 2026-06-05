import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './surakarta.css'
import { Surakarta } from './Surakarta'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Surakarta />
  </StrictMode>,
)
