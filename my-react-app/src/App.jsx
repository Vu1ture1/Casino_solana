import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import SlotMachinePage from "./slot_machine";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"; 
import Header from "./header";
import { SolanaWalletProvider } from "./solana_provider";
import ScratchCard3x3 from "./scratch_maps";
import DiceRangeGame from "./cube";
import WheelGame from "./WheelGame";
import { AudioProvider } from "./audioContext";


function App() {
  const [count, setCount] = useState(0)

  return (
   <>
  <BrowserRouter>
      <SolanaWalletProvider>
        <AudioProvider> 
        <Header />
        <Routes>
          <Route
            path="/slot"
            element={
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "100vh",
                  width: "100%",
                }}
              >
                <SlotMachinePage />
              </div>
            }
          />
          <Route
            path="/scratch-maps"
            element={
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "100vh",
                  width: "100%",
                }}
              >
                < ScratchCard3x3/>
              </div>
            }
          />
          <Route
            path="/cube"
            element={
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "100vh",
                  width: "100%",
                }}
              >
                < DiceRangeGame/>
              </div>
            }
          />
          <Route
           path="/fortune-wheel"
           element={
             <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", width: "100%" }}>
               <WheelGame />
             </div>
           }
         />
          <Route path="/" element={<Navigate to="/slot" replace />} />
        </Routes>
        </AudioProvider>
      </SolanaWalletProvider>
    </BrowserRouter>
</>

  )
}

export default App
