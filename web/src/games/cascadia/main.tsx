import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './cascadia.css'
import { Cascadia } from './Cascadia'
createRoot(document.getElementById('root')!).render(<StrictMode><Cascadia /></StrictMode>)
