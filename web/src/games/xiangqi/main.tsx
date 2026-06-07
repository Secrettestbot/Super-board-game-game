import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './xiangqi.css'
import { Xiangqi } from './Xiangqi'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Xiangqi />
  </StrictMode>,
)
