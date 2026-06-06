import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './calico.css'
import { Calico } from './Calico'
createRoot(document.getElementById('root')!).render(<StrictMode><Calico /></StrictMode>)
