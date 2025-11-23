import React, { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { SolanaConnect } from "./connect_wallet";
import { FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { clusterApiUrl } from "@solana/web3.js";

export default function DiceRangeGame() {
  const [rolling, setRolling] = useState(false);
  const [displayValue, setDisplayValue] = useState(null);
  const [finalRoll, setFinalRoll] = useState(null);
  const [leftValue, setLeftValue] = useState(1);   
  const [rightValue, setRightValue] = useState(100);
  const [result, setResult] = useState(null);
  const [winAmount, setWinAmount] = useState(0);

  const [requireEven, setRequireEven] = useState(false);
  const [requireOdd, setRequireOdd] = useState(false);
  const [requirePrime, setRequirePrime] = useState(false);

  const [showOverlayWin, setShowOverlayWin] = useState(false);
  const [showOverlayLoss, setShowOverlayLoss] = useState(false);
  const [showOverlayBigWin, setShowOverlayBigWin] = useState(false);
  const [showOverlayNoMoney, setShowOverlayNoMoney] = useState(false);
  const { publicKey, connected, sendTransaction } = useWallet();
  const [balance, setBalance] = useState(null); 
  const [multValue, setMultValue] = useState("");
    const [solPrice, setSolPrice] = useState(null);
    const [working, setWorking] = useState(false);
    const [x, setX] = useState(1.5); 

  const animRef = useRef(null);

  const minVal = Math.min(leftValue, rightValue);
  const maxVal = Math.max(leftValue, rightValue);

  const rangeSize = Math.max(1, Math.min(101, maxVal - minVal + 1));
  const multiplier = +(40 / Math.max(1, rangeSize));
  const universe = 100;
  const probability = (Math.min(rangeSize, 100) / universe) * 100;

  const isPrime = (n) => {
    if (n < 2) return false;
    if (n % 2 === 0) return n === 2;
    for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
    return true;
  };

  const parseBet = () => {
    const b = parseFloat(String(multValue).replace(",", "."));
    if (Number.isNaN(b)) return NaN;
    return b;
  };
  const isBetValid = () => {
    const b = parseBet();
    return !Number.isNaN(b) && b > 0;
  };

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  //const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, Math.round(v)));
  const clamp = (v, a = 1, b = 100) => Math.max(a, Math.min(b, Math.round(v)));

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
        // попытаемся распарсить число
        const v = parseFloat(multValue.toString().replace(",", "."));
        if (Number.isNaN(v)) return; // если не число — ничего не делаем
        const newVal = v * 2;
        // сохраняем обратно в поле как строку (убираем лишние нули)
        setMultValue(String(newVal));
    }

    async function getSolPrice() {
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
      );
      const data = await response.json();
      return data.solana.usd; // актуальный курс в USD
    } catch (err) {
      console.error("Ошибка при получении курса SOL:", err);
      return null;
    }
  }

    useEffect(() => {
        getSolPrice().then((price) => setSolPrice(price));
    }, []);

const onChangeLeft = (raw) => {
  let v = Number(raw);
  if (Number.isNaN(v)) return;
  v = clamp(v, 1, 100);
  
  if (v > rightValue) {
    return;
  }
  
  setLeftValue(v);
};

const onChangeRight = (raw) => {
  let v = Number(raw);
  if (Number.isNaN(v)) return;
  v = clamp(v, 1, 100);
  
  if (v < leftValue) {
    return;
  }
  
  setRightValue(v);
};

  async function handleRoll ()  {
    if (!connected || !publicKey) return;
            if (balance === 0 || multValue >= balance){
              setShowOverlayNoMoney(true);
              return;
            }
    
            const connection = new Connection(clusterApiUrl("devnet"));
            
            // const transaction = new Transaction().add(
            //   SystemProgram.transfer({
            //             fromPubkey: publicKey,
            //             toPubkey: new PublicKey("BFd3NZEwz41ivbC1Pq2XXn1NtTYALXtWTx63rMs1PUXq"),
            //             lamports: parseFloat(multValue) * LAMPORTS_PER_SOL,
            //         })
            //     );
    
            //     try {
            //         const signature = await sendTransaction(transaction, connection); // await обязательно!
            //         console.log("Transaction signature:", signature);
    
            //         await connection.confirmTransaction(signature, "confirmed");
            //         console.log("Transaction confirmed!");
            //     } catch (err) {
            //         console.error("Transaction failed:", err);
            //         return;
            //     }
    
    if (rolling) return;
    if (!isBetValid()) return;

    const final = Math.floor(Math.random() * 100) + 1; ///////////////////////////////////////////////////////////////////рандомное число

    setFinalRoll(null);
    setResult(null);
    setWinAmount(0);
    setRolling(true);

    const duration = 1600;
    const initialAmp = 50;
    const oscillations = 6;
    const startTime = performance.now();

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);

      const amp = initialAmp * (1 - eased);
      const angle = (elapsed / duration) * oscillations * Math.PI * 2;

      let val = Math.round(final + Math.sin(angle) * amp);

      if (t < 0.5) {
        const smallJitter = Math.round((1 - eased) * 6);
        val += Math.round((Math.random() * smallJitter * 2) - smallJitter);
      }

      val = Math.max(0, Math.min(100, val));
      setDisplayValue(val);

      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(final);
        setFinalRoll(final);

        const inRange = final >= minVal && final <= maxVal;
        let condOk = true;
        if (requireEven && final % 2 !== 0) condOk = false;
        if (requireOdd && final % 2 !== 1) condOk = false;
        if (requirePrime && !isPrime(final)) condOk = false;

        const win = inRange && condOk;
        if (win) {
          const b = parseBet();
          setX(1.6);
          
          const payout = +(b * x).toFixed(6);
          setWinAmount(payout);


            const audio = document.getElementById("bg-audio");
                
                setTimeout(() => {
                    //evaluateAndPlay();
                    audio.volume = 0;
                    setShowOverlayWin(true);

                    
                    //setShowOverlayBigWin(true);
                    //setShowOverlayNoMoney(true);

                    setResult("win");
                   
                }, 1000); 


          
        } else {
          setWinAmount(0);
            const audio = document.getElementById("bg-audio");
                
                setTimeout(() => {
                    //evaluateAndPlay();
                    audio.volume = 0;
                    
                    setX(1);

                    setShowOverlayLoss(true);

                    setResult("lose");
                   
                }, 1000); 

          
        }

        setRolling(false);
      }
    };

    animRef.current = requestAnimationFrame(step);
  };

  const reset = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setRolling(false);
    setDisplayValue(null);
    setFinalRoll(null);
    setResult(null);
    setWinAmount(0);
  };

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

  const rangeLeftPercent = ((minVal - 1) / 99) * 100
  const rangeWidthPercent = ((maxVal - minVal + 1) / 100) * 100;

  return (
    <div style={{ maxWidth: "80%", backgroundColor: "white", gap: "10px", borderRadius: 12, padding: "25px", fontFamily: "system-ui, sans-serif" }}>
      {/* стилевой блок для кастомных thumb-ов */}
      <style>{`
        .range-slider {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          width: 100%;
          margin: 10px 0;
        }
        .range-slider::-webkit-slider-runnable-track {
          -webkit-appearance: none;
          height: 6px;
          background: #eee;
          border-radius: 6px;
        }
        .range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #fff;
          border: 3px solid #111827;
          box-shadow: 0 4px 10px rgba(0,0,0,0.12);
          margin-top: -7px;
          cursor: pointer;
        }
        .range-slider::-moz-range-track {
          height: 6px;
          background: #eee;
          border-radius: 6px;
          border: none;
        }
        .range-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #fff;
          border: 3px solid #111827;
          box-shadow: 0 4px 10px rgba(0,0,0,0.12);
          cursor: pointer;
        }
        .range-slider:disabled {
          opacity: 0.6;
        }
        .range-slider:disabled::-webkit-slider-thumb {
          cursor: not-allowed;
        }
        .range-slider:disabled::-moz-range-thumb {
          cursor: not-allowed;
        }
      `}</style>

      <h2 style={{ marginBottom: 6, fontFamily: 'MyFont' }}>Игра Йа’куб d100</h2>
      <p style={{ marginTop: 0, marginTop: "10px", color: "#444", fontFamily: 'MyFont' }}>
        Кидай кубик d100, можешь выбрать промежуток выпадения.
      </p>

      <div style={{ display: "grid", gap: 12, fontFamily: 'MyFont' }}>

        <div style={{ display: "flex", flexDirection: "row", gap: "10px", justifyContent: "start" }}>
            <button
            style={{
                padding: "8px 14px",
                borderRadius: "8px",
                background: working ? "#374151" : "linear-gradient(270deg, #FFD700, #FFA500, #FFD700)",
                color: "#fff",
                fontWeight: 600,
                fontFamily: 'MyFont',
            }}
            
            
                onClick={handleRoll}
                disabled={rolling || !multValue}
            >
            {rolling ? "Критический успех(промах)…" : "Кинуть"}
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
                disabled={rolling}
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
                disabled={rolling}
            >
                x2
            </button>
            </div>
            </div>

        {/* два отдельных ползунка */}
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <div style={{ minWidth: 80 }}>Левая граница:</div>
            <input
                type="number"
                value={leftValue}
                onChange={(e) => {
                    const newValue = Number(e.target.value);
                    if (!Number.isNaN(newValue) && newValue <= rightValue) { // <= вместо <
                    onChangeLeft(newValue);
                    }
                }}
                disabled={rolling}
                style={{ width: 80, padding: "6px", borderRadius: 6, border: "1px solid #ddd" }}
                />
            <div style={{ minWidth: 80, marginLeft: 12 }}>Правая граница:</div>
            <input
                type="number"
                value={rightValue}
                onChange={(e) => {
                    const newValue = Number(e.target.value);
                    if (!Number.isNaN(newValue) && newValue >= leftValue) { // >= вместо >
                    onChangeRight(newValue);
                    }
                }}
                disabled={rolling}
                style={{ width: 80, padding: "6px", borderRadius: 6, border: "1px solid #ddd" }}
                />
            <div style={{ marginLeft: "auto", color: "#666" }}>
                Диапазон: <strong>{minVal} — {maxVal}</strong> (размер: {rangeSize})
            </div>
            </div>

            <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Левый ползунок: {leftValue}</div>
            <input
                type="range"
                className="range-slider"
                min={1}
                max={100}
                step={1}
                value={leftValue}
                onChange={(e) => onChangeLeft(Number(e.target.value))}
                disabled={rolling}
            />
            </div>

            {/* Правый ползунок */}
            <div>
            <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Правый ползунок: {rightValue}</div>
            <input
                type="range"
                className="range-slider"
                min={1}
                max={100}
                step={1}
                value={rightValue}
                onChange={(e) => onChangeRight(Number(e.target.value))}
                disabled={rolling}
            />
            </div>

          <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
            Вероятность попасть: <strong>{probability.toFixed(2)}%</strong>
          </div>
        </div>

        {/* доп условия */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={requireEven} disabled={rolling} onChange={(e) => setRequireEven(e.target.checked)} />
            Чётное
          </label>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={requireOdd} disabled={rolling} onChange={(e) => setRequireOdd(e.target.checked)} />
            Нечётное
          </label>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={requirePrime} disabled={rolling} onChange={(e) => setRequirePrime(e.target.checked)} />
            Простое число
          </label>

          <div style={{ marginLeft: "auto", color: "#777", fontSize: 13 }}>
            Доп условия — они <em>все</em> дают при доп x(сы).
          </div>
        </div>

        {/* controls */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>

          <div style={{ marginLeft: "auto", color: "#333" }}>{finalRoll === null ? "—" : `Выпало: ${finalRoll}`}</div>
        </div>

        {/* визуализация диапазона и указатель */}
        <div style={{ position: "relative", height: 64, marginTop: "40px", padding: "5px"}}>
          <div style={{ height: 12, background: "#eee", borderRadius: 8, position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                left: `${rangeLeftPercent}%`,
                width: `${rangeWidthPercent}%`,
                top: 0,
                bottom: 0,
                background: "linear-gradient(90deg, rgba(16,185,129,0.18), rgba(16,185,129,0.12))",
              }}
            />
          </div>

          <div
            style={{
              position: "absolute",
              top: -36,
              left: `${displayValue !== null ? (displayValue / 100) * 100 : 0}%`,
              transform: "translateX(-50%)",
              transition: rolling ? "none" : "left 300ms ease",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                minWidth: 32,
                textAlign: "center",
                padding: "6px 8px",
                background: "#111827",
                color: "#fff",
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 18,
                boxShadow: "0 6px 18px rgba(0,0,0,0.12)"
              }}
            >
              {displayValue === null ? "-" : displayValue}
            </div>
            {/* <div style={{ width: 8, height: 8, borderRadius: 4, background: "#111827" }} /> */}
          </div>

          <div style={{ position: "absolute", left: 0, right: 0, top: 24, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
            <span>1</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>

        {/* result */}
        {result && (
          <div style={{ marginTop: 6, padding: 12, borderRadius: 8, background: result === "win" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.06)", border: result === "win" ? "1px solid rgba(16,185,129,0.18)" : "1px solid rgba(239,68,68,0.12)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{result === "win" ? "Победа!" : "Проигрыш"}</div>

            <div style={{ fontSize: 14 }}>Выпало: <strong>{finalRoll}</strong></div>
            <div style={{ fontSize: 14 }}>Выигрыш: <strong>{winAmount.toFixed(3) - multValue} SOL ≈ {(winAmount.toFixed(3) * solPrice - parseFloat(multValue) * solPrice).toFixed(3)} USD; кф = ({x}x)</strong></div>
            <div style={{ marginTop: 8, color: "#444", fontSize: 13 }}>
              Диапазон: <strong>{minVal} — {maxVal}</strong> (левый: {leftValue}, правый: {rightValue})
            </div>
            <div style={{ color: "#444", fontSize: 13 }}>
              Условие(я): <strong>{requireEven ? "Чётное " : ""}{requireOdd ? "Нечётное " : ""}{requirePrime ? "Простое" : ""}{!requireEven && !requireOdd && !requirePrime ? "Нет" : ""}</strong>
            </div>
          </div>
        )}
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
                flexDirection: "column", // добавляем для вертикального расположения
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