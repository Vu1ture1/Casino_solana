import { useState, useEffect, useRef } from "react";
import { SolanaConnect } from "./connect_wallet";
import { FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { clusterApiUrl } from "@solana/web3.js";



export default function Header() {
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef(null);
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState(null); 
  useEffect(() => {
    const audioEl = document.getElementById("bg-audio");
    if (!audioEl) {
      console.warn("Элемент #bg-audio не найден в DOM");
      return;
    }
    audioRef.current = audioEl;

    // Настройки
    audioEl.loop = true;
    audioEl.volume = 0.5;
    audioEl.muted = true; // стартуем muted, чтобы автоплей был разрешён

    // Попытка проиграть — может вернуть промис или undefined
    try {
      const playResult = audioEl.play();
      // если playResult — промис, ловим ошибки
      if (playResult && typeof playResult.then === "function") {
        playResult.catch((err) => {
          console.log("Автоплей заблокирован (catch):", err);
        });
      } else {
        // playResult undefined — ничего дальше не делаем
        console.log("audio.play() не вернул промис (возможно старый браузер)");
      }
    } catch (err) {
      console.log("Ошибка при попытке play():", err);
    }

    return () => {
      // не останавливаем аудио (оно живёт в index.html), просто очищаем реф
      audioRef.current = null;
    };
  }, []);

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

  const toggleAudio = () => {
    const a = audioRef.current;
    if (!a) {
      console.warn("Аудио не инициализировано");
      return;
    }

    if (!a.paused) {
      a.pause();
      setAudioPlaying(false);
    } else {
      // пользовательский клик — можно снимать muted и включать звук
      a.muted = false;
      try {
        const playResult = a.play();
        if (playResult && typeof playResult.then === "function") {
          playResult.catch((err) => {
            console.warn("play() отклонился после клика:", err);
          });
        }
      } catch (err) {
        console.warn("Ошибка play() после клика:", err);
      }
      setAudioPlaying(true);
    }
  };

  return (
    <header
      style={{
        color: "#fff",
        padding: "10px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderRadius: "5px"
      }}
    >
      {/* <a href="/" style={{ textDecoration: "none", color:"inherit", fontFamily: "MyFont", fontSize: "32px", margin: 0 }}>
        Атмосферный казик
      </a>
      <a href="/slot" style={{ textDecoration: "none", color:"inherit", fontFamily: "MyFont", fontSize: "25px", margin: 0 }}>
        Слот машина
      </a> */}

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <a
          href="/"
          style={{
            textDecoration: "none",
            color: "inherit",
            fontFamily: "MyFont",
            fontSize: "30px",
            margin: 0,
            
          }}
        >
          Атмосферный казик
        </a>

        <a
          href="/slot"
          style={{
            textDecoration: "none",
            color: "inherit",
            fontFamily: "MyFont",
            fontSize: "23px",
            margin: 0,
            marginTop: "3.8px"
          }}
        >
          Слот машина
        </a>

        <a
          href="/scratch-maps"
          style={{
            textDecoration: "none",
            color: "inherit",
            fontFamily: "MyFont",
            fontSize: "23px",
            margin: 0,
            marginTop: "3.8px"
          }}
        >
          Скретч-карты
        </a>

        <a
          href="/cube"
          style={{
            textDecoration: "none",
            color: "inherit",
            fontFamily: "MyFont",
            fontSize: "23px",
            margin: 0,
            marginTop: "3.8px"
          }}
        >
          Бросок кубика
        </a>

        <a
          href="/fortune-wheel"
          style={{
            textDecoration: "none",
            color: "inherit",
            fontFamily: "MyFont",
            fontSize: "23px",
            margin: 0,
            marginTop: "3.8px"
          }}
        >
          Колесо фортуны
        </a>
      </div>

      
      
      
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <SolanaConnect />

        {connected && (
          <p style={{fontSize: "18px", padding: "13px", backgroundColor: "#512DA8", borderRadius: "6px", fontFamily: 'MyFont',}}>
            Баланс: {balance !== null ? balance.toFixed(4) + " SOL" : "Загрузка..."}
          </p>
        )}


        <button
          onClick={toggleAudio}
          style={{
            background: audioPlaying ? "#2ecc71" : "#e74c3c",
            border: "none",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            height: "48px",
            width: "48px",        // квадратная кнопка для иконки
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "20px"
          }}
        >
          {audioPlaying ? <FaVolumeUp /> : <FaVolumeMute />}
        </button>
      </div>
    </header>
  );
}
