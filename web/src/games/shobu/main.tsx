import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './shobu.css'
import { Shobu } from './Shobu'
createRoot(document.getElementById('root')!).render(<StrictMode><Shobu /></StrictMode>)
