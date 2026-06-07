import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './isle_of_cats.css'
import { IsleOfCats } from './IsleOfCats'
createRoot(document.getElementById('root')!).render(<StrictMode><IsleOfCats /></StrictMode>)
