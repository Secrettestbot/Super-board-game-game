import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './gin_rummy.css'
import { GinRummy } from './GinRummy'
createRoot(document.getElementById('root')!).render(<StrictMode><GinRummy /></StrictMode>)
