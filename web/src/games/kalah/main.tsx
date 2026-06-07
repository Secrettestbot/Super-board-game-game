import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './kalah.css'
import { Kalah } from './Kalah'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Kalah />
  </StrictMode>,
)
