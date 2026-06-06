import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './thats_pretty_clever.css'
import { ThatsPrettyClever } from './ThatsPrettyClever'
createRoot(document.getElementById('root')!).render(<StrictMode><ThatsPrettyClever /></StrictMode>)
