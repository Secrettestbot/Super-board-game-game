import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './dvonn.css'
import { Dvonn } from './Dvonn'
createRoot(document.getElementById('root')!).render(<StrictMode><Dvonn /></StrictMode>)
