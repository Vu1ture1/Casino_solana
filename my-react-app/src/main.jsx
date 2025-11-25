import "./polyfills";  // Эта штука первой должна идти
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Buffer } from "buffer";
window.Buffer = Buffer; // полифилл для браузера
window.process = window.process || { env: {} };

createRoot(document.getElementById('root')).render(
  
  <StrictMode>
    
    <App />
  </StrictMode>,
)
