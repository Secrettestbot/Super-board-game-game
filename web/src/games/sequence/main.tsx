import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './sequence.css'
import { Sequence } from './Sequence'
createRoot(document.getElementById('root')!).render(<StrictMode><Sequence /></StrictMode>)
