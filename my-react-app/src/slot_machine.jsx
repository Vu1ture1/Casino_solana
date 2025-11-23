import React, { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { SolanaConnect } from "./connect_wallet";
import { FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { clusterApiUrl } from "@solana/web3.js";

export default function SlotMachinePage({
  images = [
    "/images/abdul.jpg",
    "/images/bareckiy.jpg",
    "/images/jnk.jpg",
    "/images/ozon.jpg",
    "/images/the_twins.png",
    "/images/fnw.jpg",
  ],
  audioMap = {
    win: "/sounds/win.mp3",
    smallWin: "/sounds/small-win.mp3",
    lose: "/sounds/lose.mp3",
  },
}) {
  const visibleCount = 3;
  const imageSize = 200; 
  const changeIntervalMs = 40; 
  const [showOverlayWin, setShowOverlayWin] = useState(false);
  const [showOverlayLoss, setShowOverlayLoss] = useState(false);
  const [showOverlayBigWin, setShowOverlayBigWin] = useState(false);
  const [showOverlayNoMoney, setShowOverlayNoMoney] = useState(false);
  const { publicKey, connected, sendTransaction } = useWallet();
  const [balance, setBalance] = useState(null); 
  const [x, setX] = useState(1.0); 

  const normImages = images.map((s) => (typeof s === "string" && !s.startsWith("/") ? "/" + s : s));

  const [spinning, setSpinning] = useState(false);

  const [indices, setIndices] = useState(
    Array.from({ length: visibleCount }, () => Math.floor(Math.random() * normImages.length))
  );

  const audioRefs = useRef({});
  const changeIntervals = useRef([]);
  const stopTimeouts = useRef([]);

  const [multValue, setMultValue] = useState("");
  const [solPrice, setSolPrice] = useState(null);

  useEffect(() => {
    if (!connected || !publicKey) return;

    const connection = new Connection(clusterApiUrl("devnet"));

    const updateBalance = async () => {
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / LAMPORTS_PER_SOL);
    };

    updateBalance();
    const interval = setInterval(updateBalance, 2000); 
    return () => clearInterval(interval);
  }, [connected, publicKey]);

  function multiplyByTwo() {
    const v = parseFloat(multValue.toString().replace(",", "."));
    if (Number.isNaN(v)) return; 
    const newVal = v * 2;
    setMultValue(String(newVal));
  }

  // preload audio
  useEffect(() => {
    audioRefs.current = {
      win: new Audio(audioMap.win),
      smallWin: new Audio(audioMap.smallWin),
      lose: new Audio(audioMap.lose),
    };
    Object.values(audioRefs.current).forEach((a) => (a.volume = 0.9));
  }, [audioMap]);

  useEffect(() => {
    return () => {
      changeIntervals.current.forEach((id) => clearInterval(id));
      stopTimeouts.current.forEach((t) => clearTimeout(t));
    };
  }, []);

    async function startSpin() {
        
        if (!connected || !publicKey) return;
        if (balance === 0 || multValue >= balance){
          setShowOverlayNoMoney(true);
          return;
        }

        const connection = new Connection(clusterApiUrl("devnet"));
        
        const transaction = new Transaction().add(
          SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: new PublicKey("BFd3NZEwz41ivbC1Pq2XXn1NtTYALXtWTx63rMs1PUXq"),
                    lamports: parseFloat(multValue) * LAMPORTS_PER_SOL,
                })
            );

            try {
                const signature = await sendTransaction(transaction, connection); 
                console.log("Transaction signature:", signature);

                await connection.confirmTransaction(signature, "confirmed");
                console.log("Transaction confirmed!");
            } catch (err) {
                console.error("Transaction failed:", err);
                return;
            }

        if (spinning) return;
        setSpinning(true);

        let delay = 0; 
        const spinStep = 1000;

        indices.forEach((_, pos) => {
            const intervalId = setInterval(() => {
            setIndices(prev => {
                const next = [...prev];
                next[pos] = (next[pos] + 1) % normImages.length;
                return next;
            });
            }, changeIntervalMs);

            changeIntervals.current[pos] = intervalId;

            stopTimeouts.current[pos] = setTimeout(() => {
            clearInterval(changeIntervals.current[pos]);
            
            const finalIndex = Math.floor(Math.random() * normImages.length);
            setIndices(prev => {
                const next = [...prev];
                next[pos] = finalIndex;
                return next;
            });

            if (pos === visibleCount - 1) {
                setTimeout(() => {
                evaluateAndPlay();
                //setSpinning(false);
                }, 150);

                const audio = document.getElementById("bg-audio");
                
                setTimeout(() => {
                    //evaluateAndPlay();
                    audio.volume = 0;
                    
                    setX(1.6);
                    //setShowOverlayWin(true);

                    setSpinning(false);
                    //setShowOverlayLoss(true);
                    setShowOverlayBigWin(true);
                    //setShowOverlayNoMoney(true);
                   
                }, 1000); 
                

                //setShowOverlayWin(true);
                //setShowOverlayLoss(true);
                //setShowOverlayBigWin(true);
                //setShowOverlayNoMoney(true);
            }
            }, delay + spinStep);

            delay += spinStep;
        });
    }

  function evaluateAndPlay() {
    const vals = indices.map((i) => normImages[i]);
    const counts = {};
    vals.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    const top = Math.max(...Object.values(counts));
    let outcome = "lose";
    if (top === 3) outcome = "win";
    else if (top === 2) outcome = "smallWin";

    const audio = audioRefs.current[outcome];
    if (audio) {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  async function getSolPrice() {
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
      );
      const data = await response.json();
      return data.solana.usd; 
    } catch (err) {
      console.error("Ошибка при получении курса SOL:", err);
      return null;
    }
  }

  useEffect(() => {
    getSolPrice().then((price) => setSolPrice(price));
  }, []);

  
  useEffect(() => {
    if (showOverlayNoMoney) {
      const timer = setTimeout(() => {
        const audio = document.getElementById("bg-audio");
        if (audio) audio.volume = 0.6;
        setShowOverlayNoMoney(false);
      }, 3000); 
      return () => clearTimeout(timer);
    }
  }, [showOverlayNoMoney]);

  

  return (
    <div className="d-flex justify-content-center align-items-center" style={{ background: "white", borderRadius: 12, padding: "25px" }}>
      <div className="card shadow-sm" style={{ width: "100%", borderRadius: 12 }}>
        <div className="card-body">
          <h3 style={{
                display: "flex",
                justifyContent: "center", 
                alignItems: "center",     
                width: "100%",            
                marginTop: "20px",        
                fontFamily: 'MyFont',
                fontSize: '40px'
            }} className="card-title text-center mb-4">ДЭП МАШИНА (99,999% выйгрыш)</h3>

          <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "nowrap",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px"
                }}
                className="mb-4"
                >

            {indices.map((idxVal, pos) => (
              <div
                key={pos}
                className="d-flex align-items-center justify-content-center"
                style={{
                  width: `${imageSize}px`,
                  height: `${imageSize}px`,
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "rgba(0,0,0,0.05)",
                  boxShadow: spinning ? "0 8px 24px rgba(0,0,0,0.12)" : "none",
                  transition: "transform 160ms",
                  borderStyle: "outset",
                  borderWidth: "5px",
                  borderColor: "gold"
                }}
              >
                <img
                  src={normImages[idxVal]}
                  alt={`slot-${pos}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover"}}
                  onError={(e) => {
                    e.currentTarget.style.opacity = "0.35";
                  }}
                />
              </div>
            ))}
          </div>

          <div
            style={{
                display: "flex",
                justifyContent: "center",  
                alignItems: "center",      
                width: "100%",             
                marginTop: "20px"          
            }}
            >
                <button
                    style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    background: spinning ? "#374151" : "linear-gradient(270deg, #FFD700, #FFA500, #FFD700)",
                    color: "#fff",
                    fontWeight: 600,
                    fontFamily: 'MyFont',
                    }}
                    onClick={startSpin}
                    // disabled={spinning}
                    disabled={spinning || !multValue}
                >
                    {spinning ? "Лудим…" : "Дэп"}
                </button>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={multValue}
                    onChange={(e) => setMultValue(e.target.value)}
                    onKeyDown={(e) => {
                    if (e.key === "Enter") multiplyByTwo();
                    }}
                    placeholder="SOL"
                    style={{
                      marginLeft: "8px",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.12)",
                      width: 40,
                      textAlign: "center",
                      fontFamily: 'MyFont'
                    }}
                    disabled={spinning}
                  />
                 <span style={{fontWeight: "bold"}}>≈</span>
                 <span style={{ fontWeight: "normal",fontFamily: 'MyFont', }}>
                    {multValue === "" || !solPrice
                      ? 0
                      : (parseFloat(multValue) * solPrice).toFixed(3)} USD
                  </span>

                  <button
                    onClick={multiplyByTwo}
                    style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#512DA8",
                    color: "#fff",
                    fontWeight: 600,
                    borderWidth: "2px",
                    borderColor: "white",
                    fontFamily: 'MyFont'
                    }}
                    disabled={spinning}
                    >
                    x2
                  </button>
                </div>
                
            </div>

            {showOverlayWin && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                backgroundColor: "rgba(0,0,0,0.6)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 9999,
                flexDirection: "column", 
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 20,
                  color: "#fff",
                  fontSize: 65,
                  fontWeight: 700,
                  textAlign: "center",
                  width: "100%",
                  fontFamily: 'MyFont',
                }}
              >
                Выигрыш: {(multValue*x - multValue).toFixed(3)} SOL ≈ {(parseFloat(multValue*x) * solPrice - parseFloat(multValue) * solPrice).toFixed(3)} USD; кф = ({x}x)
              </div>

              <video
                src="/video/win.mp4"
                autoPlay
                style={{
                  width: "50%",
                  height: "auto",
                  borderRadius: "12px",
                }}
                onEnded={() => {
                  const audio = document.getElementById("bg-audio");
                  if (audio) audio.volume = 0.6;
                  setShowOverlayWin(false);
                }}
              />
            </div>
          )}

        {showOverlayLoss && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(0,0,0,0.6)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
              flexDirection: "column",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 20,
                color: "#fff",
                fontSize: 90,
                fontWeight: 700,
                textAlign: "center",
                width: "100%",
                fontFamily: 'MyFont',
              }}
            >
              Проигрыш  
            </div>

            <video
              src="/video/loss3.mp4"
              autoPlay
              style={{
                width: "50%",
                height: "auto",
                borderRadius: "12px",
              }}
              onEnded={() => {
                const audio = document.getElementById("bg-audio");
                if (audio) audio.volume = 0.6;
                setShowOverlayLoss(false);
              }}
            />
          </div>
        )}

        {showOverlayBigWin && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(0,0,0,0.6)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
              flexDirection: "column",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 20,
                color: "#fff",
                fontSize: 65,
                fontWeight: 700,
                textAlign: "center",
                width: "100%",
                fontFamily: 'MyFont',
              }}
            >
              Макс вин!!! Выигрыш: {(multValue*x - multValue).toFixed(3)} SOL ≈ {(parseFloat(multValue*x) * solPrice - parseFloat(multValue) * solPrice).toFixed(3)} USD; кф = ({x}x)
            </div>

            <video
              src="/video/BigWin.mp4"
              autoPlay
              style={{
                width: "50%",
                height: "auto",
                borderRadius: "12px",
              }}
              onEnded={() => {
                const audio = document.getElementById("bg-audio");
                if (audio) audio.volume = 0.6;
                setShowOverlayBigWin(false);
              }}
            />
          </div>
        )}

            {showOverlayNoMoney && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  backgroundColor: "rgba(0,0,0,0.6)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  zIndex: 9999,
                }}
              >
                <img
                  src="/images/nomoney.jpg"
                  style={{
                    width: "50%",
                    height: "auto",
                    borderRadius: "12px",
                  }}
                />
              </div>
            )}

        </div>
      </div>
    </div>
  );
}
