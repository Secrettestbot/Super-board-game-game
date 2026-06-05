import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './onitama.css'
import { Onitama } from './Onitama'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Onitama />
  </StrictMode>,
)
