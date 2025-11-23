import { FaCheck } from "react-icons/fa";
import { FaTimes } from "react-icons/fa";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { Outlet } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { SolanaConnect } from "./connect_wallet";
import { clusterApiUrl } from "@solana/web3.js";

export default function ScratchCard3x3({
  images = [
    "/images/cases/1_1.jpg",
    "/images/cases/1_2.jpg",
    "/images/cases/1_3.jpg",
    "/images/cases/2_1.jpg",
    "/images/cases/2_2.jpg",
    "/images/cases/2_3.jpg",
    "/images/cases/3_1.jpg",
    "/images/cases/3_2.jpg",
    "/images/cases/3_3.jpg",
    "/images/cases/4_1.jpg",
    "/images/cases/4_2.jpg",
    "/images/cases/4_3.jpg",
  ],
}) {
  const [started, setStarted] = useState(false);
  const [selectedSet, setSelectedSet] = useState(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const [assignedImages, setAssignedImages] = useState(null);




    const [showOverlayWin, setShowOverlayWin] = useState(false);
      const [showOverlayLoss, setShowOverlayLoss] = useState(false);
      const [showOverlayBigWin, setShowOverlayBigWin] = useState(false);
      const [showOverlayNoMoney, setShowOverlayNoMoney] = useState(false);
      const { publicKey, connected, sendTransaction } = useWallet();
      const [balance, setBalance] = useState(null); 

    const [multValue, setMultValue] = useState("");
    const [solPrice, setSolPrice] = useState(null);
    const [working, setWorking] = useState(false);
    const [x, setX] = useState(1.0); 
    
    useEffect(() => {
        if (!connected || !publicKey) return;
    
        const connection = new Connection(clusterApiUrl("devnet"));
    
        const updateBalance = async () => {
          const lamports = await connection.getBalance(publicKey);
          setBalance(lamports / LAMPORTS_PER_SOL);
        };
    
        updateBalance();
        const interval = setInterval(updateBalance, 2000); // обновление каждые 10 секунд
        return () => clearInterval(interval);
      }, [connected, publicKey]);

      function multiplyByTwo() {
        const v = parseFloat(multValue.toString().replace(",", "."));
        if (Number.isNaN(v)) return; 
        const newVal = v * 2;
        setMultValue(String(newVal));
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
          }, 5000);
          return () => clearTimeout(timer);
        }
      }, [showOverlayNoMoney]);

  const [cellState, setCellState] = useState({});

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const pickUniqueImages = () => {
    if (!images || images.length === 0) return Array(9).fill(null);
    if (images.length < 9) {
      const result = [];
      for (let i = 0; i < 9; i++) result.push(images[i % images.length]);
      return result;
    }
    const shuffled = shuffle(images);
    return shuffled.slice(0, 9);
  };

  async function handlePlay () {
    if (!connected || !publicKey) return;
    if (balance === 0 || multValue >= balance){
        setShowOverlayNoMoney(true);
        return;
    }
    
    setWorking(true);
    setStarted(true);
    setSelectedSet(new Set());
    setRevealed(false);
    setAssignedImages(pickUniqueImages());
    setCellState({});
  };

  const handleReset = () => {
    setWorking(false)
    setStarted(false);
    setSelectedSet(new Set());
    setRevealed(false);
    setAssignedImages(null);
    setCellState({});
  };

  const handleCellClick = (index) => {
    if (revealed) return;
    setSelectedSet((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
        next.delete(index); 
        } else {
        if (prev.size >= 3) return prev; 
        next.add(index); 
        }
        return next;
    });
    };

  async function finalizeSelection  ()  {
    if (selectedSet.size >= 3) {
      setRevealed(true);
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
                    handleReset();
                    console.error("Transaction failed:", err);
                }

        console.log(matrix);

        

        handleReset();
    }
  };

  const matrix = useMemo(() => Array.from({ length: 9 }, (_, i) => (selectedSet.has(i) ? 1 : 0)), [selectedSet]);

  const handleMouseMove = (e, idx) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const maxDeg = 35;
    const ry = x * maxDeg;
    const rx = -y * maxDeg;
    setCellState((s) => ({ ...s, [idx]: { ...(s[idx] || {}), rx, ry, hover: true } }));
  };
  const handleMouseLeave = (idx) => {
    setCellState((s) => ({ ...s, [idx]: { rx: 0, ry: 0, hover: false, pressed: false } }));
  };
  const handleMouseDown = (idx) => {
    setCellState((s) => ({ ...s, [idx]: { ...(s[idx] || {}), pressed: true } }));
  };
  const handleMouseUp = (idx) => {
    setCellState((s) => ({ ...s, [idx]: { ...(s[idx] || {}), pressed: false } }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        
        <div style={{ backgroundColor: "white", gap: "10px", borderRadius: 12, padding: "25px" }}>
            
            <h2 style={{ textAlign: "center", fontFamily: 'MyFont', }}>3x3 Скретч-карточный дэп</h2>
            <div style={{ display: "flex", flexDirection: "row", gap: "10px", marginTop: "10px", justifyContent: "center" }}>
            <button
            style={{
                padding: "8px 14px",
                borderRadius: "8px",
                background: working ? "#374151" : "linear-gradient(270deg, #FFD700, #FFA500, #FFD700)",
                color: "#fff",
                fontWeight: 600,
                fontFamily: 'MyFont',
            }}
             onClick={handlePlay}
             disabled={working || !multValue}
            >
            {working ? "Раздача карточек…" : "Играть"}
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
                disabled={working}
            />
            <span style={{ fontWeight: "bold" }}>≈</span>
            <span style={{ fontWeight: "normal", fontFamily: 'MyFont' }}>
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
                disabled={working}
            >
                x2
            </button>
            </div>
            </div>
        </div>


      {started && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ backgroundColor: "white", display: "flex", flexDirection: "row", gap: "5px", borderRadius: 12, padding: "15px" }}>
            <div style={{ fontFamily: 'MyFont', fontSize: 14, display: "flex", alignItems: "center" }}>
                Выбрано: {selectedSet.size} / 3
            </div>

            <button
                onClick={finalizeSelection}
                disabled={selectedSet.size < 3}
                style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#512DA8",
                    color: "#fff",
                    fontWeight: 600,
                    borderWidth: "2px",
                    borderStyle: "solid",
                    borderColor: selectedSet.size === 3 ? "green" : "white",
                    fontFamily: 'MyFont',
                    cursor: selectedSet.size < 3 ? "not-allowed" : "pointer",
                    transition: "border-color 0.2s ease",
                    borderWidth: "3px"
                }}
                >
                Завершить
            </button>

        </div>

          <div
            role="grid"
            aria-label="scratch-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 200px)",
              gridTemplateRows: "repeat(3, 200px)",
              gap: 10,
              padding: 8,
            }}
          >
            {Array.from({ length: 9 }).map((_, idx) => {
              const isSelected = selectedSet.has(idx);
              const state = cellState[idx] || { rx: 0, ry: 0, hover: false, pressed: false };

              const borderColor = isSelected
                ? state.hover
                  ? "4px solid #E53935"
                  : "4px solid #4CAF50"
                : state.hover
                ? "4px solid #4CAF50"
                : "3px solid #E53935";

              const innerShadow = isSelected ? "inset 0 0 20px #4CAF50" : "none";
              const combinedBoxShadow = innerShadow === "none" ? "0 6px 18px rgba(0,0,0,0.08)" : `${innerShadow}, 0 6px 18px rgba(0,0,0,0.08)`;

              const baseCellStyle = {
                width: 200,
                height: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                border: borderColor,
                userSelect: "none",
                cursor: revealed ? "default" : "pointer",
                fontFamily: "sans-serif",
                fontSize: 20,
                boxShadow: combinedBoxShadow,
                position: "relative",
                overflow: "hidden",
                backgroundColor: "#fff",
                transition: "transform 220ms cubic-bezier(.2,.9,.2,1), border-color 180ms ease, box-shadow 220ms ease",
                transformStyle: "preserve-3d",
                willChange: "transform",
              };

              const transformStyle = {
                transform: `perspective(800px) rotateX(${state.rx}deg) rotateY(${state.ry}deg) scale(${state.pressed ? 0.985 : 1})`,
              };

              const imageElement = assignedImages && assignedImages[idx] ? (
                <img
                  src={assignedImages[idx]}
                  alt={`cell-${idx}`}
                  style={{
                    maxWidth: "95%",
                    maxHeight: "95%",
                    objectFit: "contain",
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none",
                    borderRadius: 8,
                  }}
                />
              ) : null;

              return (
                <div
                  key={idx}
                  role="button"
                  aria-pressed={isSelected}
                  onClick={() => handleCellClick(idx)}
                  onMouseMove={(e) => handleMouseMove(e, idx)}
                  onMouseLeave={() => handleMouseLeave(idx)}
                  onMouseDown={() => handleMouseDown(idx)}
                  onMouseUp={() => handleMouseUp(idx)}
                  style={{ ...baseCellStyle, ...transformStyle }}
                >
                  {imageElement}

                  {revealed && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 8,
                        right: 8,
                        background: "rgba(255,255,255,0.88)",
                        padding: "6px 8px",
                        borderRadius: 6,
                        fontWeight: 700,
                      }}
                    >
                      {(() => {
                        if (matrix[idx] === 1) {
                          return <FaCheck size={20} color="green" />;
                        }
                        return <FaTimes size={20} color="red" />;
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>


            


        </div>
      )}

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
  );
}
