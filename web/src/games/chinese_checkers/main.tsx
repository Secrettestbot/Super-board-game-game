import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './chinese_checkers.css'
import { ChineseCheckers } from './ChineseCheckers'
createRoot(document.getElementById('root')!).render(<StrictMode><ChineseCheckers /></StrictMode>)
