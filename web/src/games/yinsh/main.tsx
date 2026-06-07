import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './yinsh.css'
import { Yinsh } from './Yinsh'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Yinsh />
  </StrictMode>,
)
