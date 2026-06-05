import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './mijnlieff.css'
import { Mijnlieff } from './Mijnlieff'
createRoot(document.getElementById('root')!).render(<StrictMode><Mijnlieff /></StrictMode>)
