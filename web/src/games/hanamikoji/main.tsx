import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './hanamikoji.css'
import { Hanamikoji } from './Hanamikoji'
createRoot(document.getElementById('root')!).render(<StrictMode><Hanamikoji /></StrictMode>)
