import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './perudo.css'
import { Perudo } from './Perudo'
createRoot(document.getElementById('root')!).render(<StrictMode><Perudo /></StrictMode>)
