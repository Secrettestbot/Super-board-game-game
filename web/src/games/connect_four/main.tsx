import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './connect_four.css'
import { ConnectFour } from './ConnectFour'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConnectFour />
  </StrictMode>,
)
