import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './shut_the_box.css'
import { ShutTheBox } from './ShutTheBox'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ShutTheBox />
  </StrictMode>,
)
