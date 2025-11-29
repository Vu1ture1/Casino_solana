// src/header.jsx
import React, { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaConnect } from "./connect_wallet";
import { FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { useAudio } from "./audioContext";

export default function Header() {
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState(null);

  const {
    playing,
    muted,
    trackIndex,
    tracks,
    togglePlay,
    toggleMute,
    nextTrack,
    prevTrack,
  } = useAudio();

  useEffect(() => {
    if (!connected || !publicKey) return;

    const connection = new Connection(clusterApiUrl("devnet"));

    const updateBalance = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (e) {
        console.warn("Failed to fetch balance:", e);
      }
    };

    updateBalance();
    const interval = setInterval(updateBalance, 2000);
    return () => clearInterval(interval);
  }, [connected, publicKey]);

  const handleToggleAudio = async () => {
    if (!playing) {
      await togglePlay();
      if (muted) {
        toggleMute();
      }
      return;
    }
    await togglePlay();
  };

  const currentTrackName = tracks && tracks.length > 0 ? tracks[trackIndex]?.split("/").pop() : "";

  return (
    <header
      style={{
        color: "#fff",
        padding: "14px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderRadius: "5px",
        position: "static",
        zIndex: 2000,
        background: "transparent",
        marginBottom: "180px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <a href="/" style={{ textDecoration: "none", color: "#fff", fontFamily: "MyFont", fontSize: "30px", margin: 0 }}>
          Атмосферный казик
        </a>

        <a href="/slot" style={{ textDecoration: "none", color: "#fff", fontFamily: "MyFont", fontSize: "23px", margin: 0, marginTop: "3.8px" }}>
          Слот машина
        </a>

        <a href="/scratch-maps" style={{ textDecoration: "none", color: "#fff", fontFamily: "MyFont", fontSize: "23px", margin: 0, marginTop: "3.8px" }}>
          Скретч-карты
        </a>

        <a href="/cube" style={{ textDecoration: "none", color: "#fff", fontFamily: "MyFont", fontSize: "23px", margin: 0, marginTop: "3.8px" }}>
          Бросок кубика
        </a>

        <a href="/fortune-wheel" style={{ textDecoration: "none", color: "#fff", fontFamily: "MyFont", fontSize: "23px", margin: 0, marginTop: "3.8px" }}>
          Колесо фортуны
        </a>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <SolanaConnect />

        {connected && (
          <p
            style={{
              fontSize: "18px",
              padding: "13px",
              backgroundColor: "#512DA8",
              borderRadius: "6px",
              fontFamily: "MyFont",
              margin: 0,
              color: "#fff",
            }}
          >
            Баланс: {balance !== null ? Number(balance).toFixed(9) + " SOL" : "Загрузка..."}
          </p>
        )}

        <div style={{ color: "#fff", fontSize: 12, textAlign: "center", minWidth: 140, backgroundColor: "#512DA8", }}>
          <div style={{ opacity: 0.9 }}>{currentTrackName || "— музыка —"}</div>
          <div style={{ fontSize: 11, color: "#ddd" }}>{playing ? (muted ? "muted" : "playing") : "paused"}</div>
        </div>

        <button
          onClick={prevTrack}
          title="Previous track"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#fff",
            padding: "6px 8px",
            borderRadius: "6px",
            backgroundColor: "#512DA8",
            cursor: "pointer",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 6,
          }}
        >
          {"⟸"}
        </button>

        <button
          onClick={handleToggleAudio}
          style={{
            background: playing && !muted ? "#2ecc71" : "#e74c3c",
            border: "none",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            height: "48px",
            width: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "20px",
          }}
        >
          {!muted && playing ? <FaVolumeUp /> : <FaVolumeMute />}
        </button>

        <button
          onClick={nextTrack}
          title="Next track"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#fff",
            padding: "6px 8px",
            backgroundColor: "#512DA8",
            borderRadius: "6px",
            cursor: "pointer",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: 6,
          }}
        >
          {"⟹"}
        </button>

      </div>
    </header>
  );
}
