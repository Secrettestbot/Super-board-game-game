import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './senet.css'
import { Senet } from './Senet'
createRoot(document.getElementById('root')!).render(<StrictMode><Senet /></StrictMode>)
