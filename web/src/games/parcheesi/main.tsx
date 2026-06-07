import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './parcheesi.css'
import { Parcheesi } from './Parcheesi'
createRoot(document.getElementById('root')!).render(<StrictMode><Parcheesi /></StrictMode>)
