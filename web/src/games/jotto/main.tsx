import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './jotto.css'
import { Jotto } from './Jotto'
createRoot(document.getElementById('root')!).render(<StrictMode><Jotto /></StrictMode>)
