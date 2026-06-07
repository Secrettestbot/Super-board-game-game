import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './machi_koro.css'
import { MachiKoro } from './MachiKoro'
createRoot(document.getElementById('root')!).render(<StrictMode><MachiKoro /></StrictMode>)
