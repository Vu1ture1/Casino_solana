import { FaCheck } from "react-icons/fa";
import { FaTimes } from "react-icons/fa";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { clusterApiUrl } from "@solana/web3.js";

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Orao, randomnessAccountAddress, networkStateAccountAddress } from "@orao-network/solana-vrf";

const CLUSTER = "devnet";
const RPC = clusterApiUrl(CLUSTER);
const PROGRAM_ID = new PublicKey(process.env.REACT_APP_PROGRAM_ID_SCRATCH || "7fw9uBBxhM4pHMg6TG1wji6xJqZEfDST2HRDwMVHvGTw");
const VAULT_SEED = "vault_scratch_v1";
const TREASURY_SEED = "treasury_scratch_v1";
const CONFIG_AGENT_SEED = "config_agent_scratch_v1";
const AGENT_BASE = process.env.REACT_APP_AGENT_SCRATCH_BASE || "http://localhost:3002";

//const FIXED_SOL_PRICE = 141.79; 

export default function ScratchCard3x3({ images = [
    "/images/cases/1_1.jpg",
    "/images/cases/1_2.jpg",
    "/images/cases/1_3.jpg",
    "/images/cases/2_1.jpg",
    "/images/cases/2_2.jpg",
    "/images/cases/2_3.jpg",
    "/images/cases/3_1.jpg",
    "/images/cases/3_2.jpg",
    "/images/cases/3_3.jpg",
  ], }) {
  const { publicKey, connected, wallet } = useWallet();
  const connectionRef = useRef(new Connection(RPC, "confirmed"));

  const [started, setStarted] = useState(false);
  const [selectedSet, setSelectedSet] = useState(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const [assignedImages, setAssignedImages] = useState(null);
  const [cellState, setCellState] = useState({});
  const [working, setWorking] = useState(false);

  const [showOverlayWin, setShowOverlayWin] = useState(false);
  const [showOverlayLoss, setShowOverlayLoss] = useState(false);
  const [showOverlayBigWin, setShowOverlayBigWin] = useState(false);
  const [showOverlayNoMoney, setShowOverlayNoMoney] = useState(false);

  const prevAudioVolRef = useRef(null);

  useEffect(() => {
    const audio = document.getElementById("bg-audio");
    if (!audio) return;

    const anyOverlayShown = !!(showOverlayWin || showOverlayLoss || showOverlayBigWin);

    if (anyOverlayShown) {
      if (prevAudioVolRef.current === null) prevAudioVolRef.current = audio.volume;
      audio.volume = 0.1;
    } else {
      if (prevAudioVolRef.current !== null) {
        audio.volume = prevAudioVolRef.current;
        prevAudioVolRef.current = null;
      } else {
        audio.volume = 0.6; 
      }
    }
  }, [showOverlayWin, showOverlayLoss, showOverlayBigWin]);

  const [multValue, setMultValue] = useState("");
  const [balance, setBalance] = useState(null);
  const [x, setX] = useState(1.0);

  const [result, setResult] = useState(null); 

  const [log, setLog] = useState([]);
  function addLog(s) {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${s}`;
    setLog((l) => [...l, line]);
    console.log(line);
  }

  const [solPrice, setSolPrice] = useState(null);

  useEffect(() => {
    async function getSolPrice() {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
        const j = await r.json();
        setSolPrice(j.solana?.usd ?? null);
      } catch (e) {
        addLog("Failed fetching SOL price: " + (e?.message || e), "info");
        setSolPrice(null);
      }
    }
    getSolPrice();
    const id = setInterval(getSolPrice, 60_000); 
    return () => clearInterval(id);
  }, []);

  const connection = connectionRef.current;

  useEffect(() => {
    if (!connected || !publicKey) return;
    let mounted = true;
    async function upd() {
      try {
        const lamports = await connection.getBalance(publicKey);
        if (!mounted) return;
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (e) {
        addLog("balance fetch failed: " + String(e));
      }
    }
    upd();
    const t = setInterval(upd, 3000);
    return () => { mounted = false; clearInterval(t); };
  }, [connected, publicKey, connection]);

  function multiplyByTwo() {
    const v = parseFloat((multValue || "0").toString().replace(",", "."));
    if (Number.isNaN(v)) return;
    setMultValue(String(v * 2));
  }

  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
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

  async function handleDeal() {
    if (!connected || !publicKey) {
      addLog("Wallet not connected");
      return;
    }
    const bet = parseFloat(multValue) || 0;
    if (bet <= 0) {
      addLog("Incorrect Bet");
      return;
    }
    setWorking(false);
    setStarted(true);
    setSelectedSet(new Set());
    setRevealed(false);
    setAssignedImages(pickUniqueImages());
    setCellState({});
    setResult(null);
    addLog("Cards dealt (UI ready)");
  }

  const handleReset = () => {
    setWorking(false);
    setStarted(false);
    setSelectedSet(new Set());
    setRevealed(false);
    setAssignedImages(null);
    setCellState({});
    setResult(null);
    addLog("Reset UI");
  };

  const handlePlayAgain = () => {
    setSelectedSet(new Set());
    setRevealed(false);
    setAssignedImages(pickUniqueImages());
    setCellState({});
    setResult(null);
    setShowOverlayWin(false);
    setShowOverlayBigWin(false);
    setShowOverlayLoss(false);
    setShowOverlayNoMoney(false);
    setWorking(false);
    addLog("Play Again)");
  };

  const handleCellClick = (index) => {
    if (revealed || working) return;
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else {
        if (prev.size >= 3) return prev;
        next.add(index);
      }
      return next;
    });
  };

  const matrix = useMemo(() => Array.from({ length: 9 }, (_, i) => (selectedSet.has(i) ? 1 : 0)), [selectedSet]);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitForTxConfirmed(connection, sig, timeoutMs = 60_000) {
    addLog("Waiting for tx confirmation: " + sig);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const tx = await connection.getTransaction(sig, { commitment: "confirmed" });
        if (tx && tx.meta) {
          addLog("Transaction confirmed: " + sig);
          return tx;
        }
      } catch (e) {
      }
      await sleep(700);
    }
    throw new Error("Timeout waiting for tx confirmation: " + sig);
  }
  async function waitForRandomnessAccount(connection, randomPda, timeoutMs = 60_000) {
    addLog("Searching for randomness account: " + randomPda.toBase58());
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const info = await connection.getAccountInfo(randomPda, "confirmed");
        if (info && info.lamports > 0 && info.data && info.data.length > 0) {
          addLog("Randomness account exists (lamports=" + info.lamports + ", len=" + info.data.length + ")");
          return info;
        }
      } catch (e) {
      }
      await sleep(700);
    }
    throw new Error("Timeout waiting for randomness account: " + randomPda.toBase58());
  }

  async function finalizeSelection() {
    if (selectedSet.size < 3) {
      addLog("finalizeSelection: need 3 selections, have " + selectedSet.size);
      return;
    }

    setRevealed(false);
    setWorking(true);
    addLog("finalizeSelection started");

    const connectionLocal = connection;
    const choices = Array.from(selectedSet).map((i) => i + 1);
    addLog("Player choices: " + JSON.stringify(choices));
    const betSol = parseFloat(multValue) || 0;
    const betLamports = Math.floor(betSol * LAMPORTS_PER_SOL);
    if (betLamports <= 0) {
      addLog("Invalid bet amount: " + multValue);
      setWorking(false);
      return;
    }
    addLog("Bet (lamports): " + betLamports);

    let idl = null;
    try {
      const resp = await fetch("/idl/scratch_card.json");
      if (resp.ok) idl = await resp.json();
      addLog("Loaded IDL from /idl/scratch_card.json");
    } catch (e) {
      addLog("Failed to fetch idl (ok): " + String(e));
    }

    let walletObj = wallet || (window?.solana && window.solana.isPhantom ? window.solana : null);
    if (!walletObj && !window?.solana) {
      addLog("No signer available (wallet). Aborting.");
      setWorking(false);
      return;
    }

    const walletForAnchor = {
      publicKey: (walletObj && walletObj.publicKey) || publicKey,
      signTransaction: async (tx) => {
        if (!tx.recentBlockhash) {
          const { blockhash } = await connectionLocal.getLatestBlockhash("confirmed");
          tx.recentBlockhash = blockhash;
        }
        tx.feePayer = tx.feePayer || ((walletObj && walletObj.publicKey) || publicKey);
        if (walletObj && typeof walletObj.signTransaction === "function") {
          addLog("Using walletObj.signTransaction");
          return await walletObj.signTransaction(tx);
        }
        if (window.solana && typeof window.solana.signTransaction === "function") {
          addLog("Using window.solana.signTransaction fallback");
          return await window.solana.signTransaction(tx);
        }
        addLog("Wallet does not support signTransaction()");
        return tx;
      },
      signAllTransactions: async (txs) => {
        const { blockhash } = await connectionLocal.getLatestBlockhash("confirmed");
        for (const tx of txs) {
          if (!tx.recentBlockhash) tx.recentBlockhash = blockhash;
          tx.feePayer = tx.feePayer || ((walletObj && walletObj.publicKey) || publicKey);
        }
        if (walletObj && typeof walletObj.signAllTransactions === "function") {
          return await walletObj.signAllTransactions(txs);
        }
        if (window.solana && typeof window.solana.signAllTransactions === "function") {
          return await window.solana.signAllTransactions(txs);
        }
        const out = [];
        for (const tx of txs) out.push(await walletForAnchor.signTransaction(tx));
        return out;
      },
    };

    const provider = new AnchorProvider(connectionLocal, walletForAnchor, AnchorProvider.defaultOptions());
    const program = new anchor.Program(idl || {}, provider); 
    const vrf = new Orao(provider);

    addLog("Anchor program created (via IDL + provider).");


    const [vaultPda] = await PublicKey.findProgramAddress([Buffer.from(VAULT_SEED)], PROGRAM_ID);
    const [treasuryPda] = await PublicKey.findProgramAddress([Buffer.from(TREASURY_SEED)], PROGRAM_ID);
    const [configAgentPda] = await PublicKey.findProgramAddress([Buffer.from(CONFIG_AGENT_SEED)], PROGRAM_ID);
    addLog("Vault PDA: " + vaultPda.toBase58());
    addLog("Treasury PDA: " + treasuryPda.toBase58());
    addLog("Config (agent) PDA: " + configAgentPda.toBase58());

    const forceKeypair = anchor.web3.Keypair.generate();
    const seedBytes = forceKeypair.publicKey.toBuffer();
    const randomPda = randomnessAccountAddress(seedBytes);
    const networkStatePda = networkStateAccountAddress();
    const [betPda] = await PublicKey.findProgramAddress([Buffer.from("bet"), randomPda.toBuffer()], PROGRAM_ID);

    addLog("Using seed pubkey: " + forceKeypair.publicKey.toBase58());
    addLog("Derived randomness PDA: " + randomPda.toBase58());
    addLog("Derived Bet PDA: " + betPda.toBase58());

    let netState;
    try {
      netState = await vrf.getNetworkState();
      addLog("ORAO network state fetched. treasury: " + netState.config.treasury.toBase58());
    } catch (e) {
      addLog("Failed to fetch ORAO network state: " + String(e));
      setWorking(false);
      return;
    }

    try {
      addLog("Calling placeBet on-chain...");
      const placeSig = await program.methods
        .placeBet(new anchor.BN(betLamports), choices)
        .accounts({
          player: publicKey,
          randomnessAccount: randomPda,
          bet: betPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      addLog("place_bet tx: " + placeSig);
    } catch (e) {
      addLog("place_bet failed: " + (e?.message || String(e)));
      setWorking(false);
      return;
    }

    let requestTx;
    try {
      addLog("Requesting agent to send request_vrf_agent...");
      const body = {
        seedPubkey: forceKeypair.publicKey.toBase58(),
        randomPda: randomPda.toBase58(),
        networkState: networkStatePda.toBase58(),
        vrfTreasury: netState.config.treasury.toBase58(),
        vrfProgram: vrf.programId.toBase58(),
        configPda: configAgentPda.toBase58(),
      };
      addLog("agent/request body: " + JSON.stringify(body));
      const resp = await fetch(`${AGENT_BASE}/agent/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await resp.json();
      addLog("agent/request response: " + JSON.stringify(j).slice(0, 500));
      if (!j.ok) throw new Error(j.error || JSON.stringify(j));
      requestTx = j.txSig;
      addLog("agent request_vrf tx: " + requestTx);
    } catch (e) {
      addLog("request_vrf (via agent) failed: " + (e?.message || String(e)));
      setWorking(false);
      return;
    }

    try {
      await waitForTxConfirmed(connectionLocal, requestTx, 90_000);
    } catch (e) {
      addLog("request tx did not confirm in time: " + e.message);
    }

    try {
      await waitForRandomnessAccount(connectionLocal, randomPda, 50_000);
      addLog("Randomness account detected; calling vrf.waitFulfilled()...");
      const waitFulfilledPromise = vrf.waitFulfilled(seedBytes);
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("waitFulfilled timeout after 60s")), 50_000));
      await Promise.race([waitFulfilledPromise, timeout]);
      addLog("ORAO fulfilled randomness");
    } catch (e) {
      addLog("ORAO manual check");
    }

    let resolveTx;
    let parsed;
    try {
      addLog("Requesting agent to send resolve_bet ...");
      const resp = await fetch(`${AGENT_BASE}/agent/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerPubkey: publicKey.toBase58(),
          randomPda: randomPda.toBase58(),
          betPda: betPda.toBase58(),
          vaultPda: vaultPda.toBase58(),
          treasuryPda: treasuryPda.toBase58(),
          configPda: configAgentPda.toBase58(),
        }),
      });
      const j = await resp.json();
      addLog("agent/resolve response: " + JSON.stringify(j).slice(0, 500));
      if (!j.ok) throw new Error(j.error || JSON.stringify(j));
      resolveTx = j.txSig;
      addLog("resolve_bet tx sig: " + resolveTx);

      parsed = await parseScratchResultFromTx(connectionLocal, resolveTx);
      addLog("Parsed SCRATCH_RESULT: " + JSON.stringify(parsed.raw));
    } catch (e) {
      addLog("resolve_bet failed: " + (e?.message || String(e)));
      setWorking(false);
      setRevealed(true);
      return;
    }

    try {
      const payoutLamports = Number(parsed.payoutNetLamports || 0n);
      const multiplier = betLamports > 0 ? (payoutLamports / betLamports) : 0;
      setX(multiplier);
      setResult({
        choices: parsed.choices || [],
        winning: parsed.winning || [],
        matches: parsed.matches || 0,
        payoutNetLamports: payoutLamports,
        payoutNetSol: payoutLamports / LAMPORTS_PER_SOL,
        raw: parsed.raw || parsed,
      });
      setRevealed(true);
      addLog("Computed payout lamports: " + payoutLamports + ", multiplier: " + multiplier);

      if ((parsed.matches || 0) >= 2) setShowOverlayBigWin(true);
      else if ((parsed.matches || 0) === 1) setShowOverlayWin(true);
      else setShowOverlayLoss(true);
    } catch (e) {
      addLog("Error displaying result: " + String(e));
    } finally {
      setWorking(false);
    }
  }

  async function parseScratchResultFromTx(connectionLocal, txSig, maxAttempts = 20) {
    addLog("Parsing SCRATCH_RESULT from tx: " + txSig);
    let attempt = 0;
    let waitMs = 300;
    while (attempt < maxAttempts) {
      const tx = await connectionLocal.getTransaction(txSig, { commitment: "finalized" });
      if (tx && tx.meta && Array.isArray(tx.meta.logMessages)) {
        for (const line of tx.meta.logMessages) {
          if (typeof line !== "string") continue;
          const idx = line.indexOf("SCRATCH_RESULT:");
          if (idx !== -1) {
            const jsonStr = line.slice(idx + "SCRATCH_RESULT:".length).trim();
            const obj = JSON.parse(jsonStr);
            const payout = BigInt(obj.payout_net || 0);
            return {
              choices: obj.choices,
              winning: obj.winning,
              matches: obj.matches,
              payoutNetLamports: payout,
              payoutNetSol: Number(payout) / LAMPORTS_PER_SOL,
              raw: obj,
            };
          }
        }
        throw new Error("SCRATCH_RESULT not found in transaction logs");
      }
      await sleep(waitMs);
      attempt += 1;
      waitMs = Math.min(1500, Math.floor(waitMs * 1.5));
    }
    const txFinal = await connectionLocal.getTransaction(txSig, { commitment: "confirmed" });
    if (txFinal && txFinal.meta && Array.isArray(txFinal.meta.logMessages)) {
      for (const line of txFinal.meta.logMessages) {
        if (typeof line !== "string") continue;
        const idx = line.indexOf("SCRATCH_RESULT:");
        if (idx !== -1) {
          const jsonStr = line.slice(idx + "SCRATCH_RESULT:".length).trim();
          const obj = JSON.parse(jsonStr);
          const payout = BigInt(obj.payout_net || 0);
          return {
            choices: obj.choices,
            winning: obj.winning,
            matches: obj.matches,
            payoutNetLamports: payout,
            payoutNetSol: Number(payout) / LAMPORTS_PER_SOL,
            raw: obj,
          };
        }
      }
    }
    throw new Error("No transaction meta/logs available after retries");
  }

  const winningSet = useMemo(() => {
    if (!result || !Array.isArray(result.winning)) return new Set();
    return new Set(result.winning.map((n) => (typeof n === "number" ? n - 1 : Number(n) - 1)).filter((x) => Number.isFinite(x)));
  }, [result]);

  const payoutLamports = result?.payoutNetLamports || 0;
  const payoutSol = (result?.payoutNetSol) ?? 0;
  const betVal = parseFloat(multValue) || 0;
  const betLamports = Math.floor(betVal * LAMPORTS_PER_SOL);
  const netProfitLamports = Math.max(0, (payoutLamports || 0) - (betLamports || 0));
  const netProfitSol = netProfitLamports / LAMPORTS_PER_SOL;
  const multiplierDisplay = betLamports > 0 ? ((payoutLamports || 0) / betLamports) : x;

  const betValid = !Number.isNaN(betVal) && betVal > 0;
  const finalizeEnabled = betValid && selectedSet.size === 3 && !working && started;

return (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginTop: 120, paddingTop: 120  }}>
    <div style={{ backgroundColor: "white", gap: "10px", borderRadius: 12, padding: "18px", width: "95%", maxWidth: 1100 }}>
      <h2 style={{ textAlign: "center", fontFamily: 'MyFont', margin: 0 }}>3x3 Скретч-карточный дэп</h2>

      <div style={{ display: "flex", flexDirection: "row", gap: "12px", marginTop: "12px", justifyContent: "center", alignItems: "center" }}>
        <button
          style={{
            padding: "8px 14px",
            borderRadius: "8px",
            background: working ? "#374151" : "linear-gradient(270deg, #FFD700, #FFA500, #FFD700)",
            color: "#111",
            fontWeight: 700,
            fontFamily: 'MyFont',
            minWidth: 110,
          }}
          onClick={handleDeal}
          disabled={working || !betValid} 
          title={"Раздать карты (требуется корректная ставка)"}
        >
          {working ? "Подождите…" : "Раздать"}
        </button>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            inputMode="decimal"
            value={multValue}
            onChange={(e) => setMultValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") multiplyByTwo(); }}
            placeholder="SOL"
            style={{ marginLeft: "8px", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", width: 100, textAlign: "center", fontFamily: 'MyFont' }}
            disabled={working}
          />
          <span style={{ fontWeight: "bold" }}>≈</span>
          <span style={{ fontWeight: "normal", fontFamily: 'MyFont' }}>
            {multValue === "" ? "0.000" : (parseFloat(multValue) * solPrice).toFixed(9)} USD
          </span>

          <button onClick={multiplyByTwo} style={{ padding: "8px 12px", borderRadius: 8, background: "#512DA8", color: "#fff", fontWeight: 600 }} disabled={working}>
            x2
          </button>
        </div>

        <button
          onClick={finalizeSelection}
          disabled={!finalizeEnabled}
          style={{
            padding: "8px 14px",
            borderRadius: "8px",
            background: finalizeEnabled ? "#2e7d32" : "#9E9E9E",
            color: "#fff",
            fontWeight: 700,
            fontFamily: 'MyFont',
            marginLeft: 8,
            minWidth: 120,
          }}
          title={!finalizeEnabled ? "Требуется корректная ставка и 3 выбранные карточки" : "Играть (отправить ставку и запросить результат)"}
        >
          {working ? "Лудим…" : "Играть"}
        </button>

      </div>
    </div>

    {started && (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "95%", maxWidth: 1100 }}>
        <div style={{ backgroundColor: "white", display: "flex", flexDirection: "row", gap: "5px", borderRadius: 12, padding: "12px", width: "100%", alignItems: "center" }}>
          <div style={{ fontFamily: 'MyFont', fontSize: 14, display: "flex", alignItems: "center" }}>
            Выбрано: {selectedSet.size} / 3
          </div>

          <div style={{ marginLeft: "auto", fontSize: 14, color: "#333", fontFamily: 'MyFont' }}>
            (Ставка: {betVal} SOL)
          </div>
        </div>

        <div role="grid" aria-label="scratch-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 200px)", gridTemplateRows: "repeat(3, 200px)", gap: 10, padding: 8 }}>
          {Array.from({ length: 9 }).map((_, idx) => {
            const isSelected = selectedSet.has(idx);
            const state = cellState[idx] || { rx: 0, ry: 0, hover: false, pressed: false };

            let bgColor = "#fff";
            let border = "3px solid rgba(0,0,0,0.06)";
            if (revealed && result) {
              if (winningSet.has(idx)) {
                bgColor = "#4CAF50"; 
                border = "3px solid #2e7d32";
              } else {
                bgColor = "#FF5252"; 
                border = "3px solid #b71c1c";
              }
            } else {
              border = "3px solid rgba(0,0,0,0.06)";
            }

            const selectGlow = isSelected ? { boxShadow: "0 0 0 8px rgba(255,215,0,0.95)" } : {};

            const innerShadow = (revealed && result && winningSet.has(idx)) ? "inset 0 0 30px rgba(255,255,255,0.12)" : "none";

            const baseCellStyle = {
              width: 200,
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              border,
              userSelect: "none",
              cursor: revealed ? "default" : "pointer",
              fontFamily: "sans-serif",
              fontSize: 20,
              boxShadow: innerShadow === "none" ? "0 6px 18px rgba(0,0,0,0.08)" : `${innerShadow}, 0 6px 18px rgba(0,0,0,0.08)`,
              position: "relative",
              overflow: "hidden",
              backgroundColor: bgColor,
              transition: "transform 220ms cubic-bezier(.2,.9,.2,1), border-color 180ms ease, box-shadow 220ms ease, background-color 220ms ease",
              transformStyle: "preserve-3d",
              willChange: "transform",
            };

            const transformStyle = { transform: `perspective(800px) rotateX(${state.rx}deg) rotateY(${state.ry}deg) scale(${state.pressed ? 0.985 : 1})` };

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
                  opacity: revealed ? 0.95 : 1,
                }}
              />
            ) : null;

            return (
              <div
                key={idx}
                role="button"
                aria-pressed={isSelected}
                onClick={() => handleCellClick(idx)}
                onMouseMove={(e) => {
                  const el = e.currentTarget;
                  const rect = el.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width - 0.5;
                  const y = (e.clientY - rect.top) / rect.height - 0.5;
                  const maxDeg = 35;
                  const ry = x * maxDeg;
                  const rx = -y * maxDeg;
                  setCellState((s) => ({ ...s, [idx]: { ...(s[idx] || {}), rx, ry, hover: true } }));
                }}
                onMouseLeave={() => setCellState((s) => ({ ...s, [idx]: { rx: 0, ry: 0, hover: false, pressed: false } }))}
                onMouseDown={() => setCellState((s) => ({ ...s, [idx]: { ...(s[idx] || {}), pressed: true } }))}
                onMouseUp={() => setCellState((s) => ({ ...s, [idx]: { ...(s[idx] || {}), pressed: false } }))}
                style={{ ...baseCellStyle, ...transformStyle, ...selectGlow }}
              >
                {imageElement}

                {revealed && (
                  <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(255,255,255,0.88)", padding: "6px 8px", borderRadius: 6, fontWeight: 700 }}>
                    {winningSet.has(idx) ? <FaCheck size={20} color="#fff" /> : <FaTimes size={20} color="#fff" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    )}

    <div style={{ width: "90%", maxWidth: 980, background: "#fff", borderRadius: 10, padding: 12 }}>

      {result ? (
        <div style={{ background: "#fff", padding: 12, borderRadius: 8, marginBottom: 8 }}>
          <div>Наши выборы (1..9): {Array.isArray(result.choices) ? result.choices.join(", ") : String(result.choices)}</div>
          <div>Выигрышные позиции (1..9): {Array.isArray(result.winning) ? result.winning.join(", ") : String(result.winning)}</div>
          <div>Совпадений: {result.matches}</div>
          <div>Выплата: {payoutLamports} лампортов ({(payoutLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL)</div>
        </div>
      ) : (
        <div style={{ marginBottom: 8 }}>Пока нет результатов</div>
      )}

      <h4 style={{ marginBottom: 6 }}>Логи</h4>
      <div style={{ background: "#111", color: "#fff", padding: 10, height: 220, overflow: "auto", fontSize: 12 }}>
        {log.map((l, i) => <div key={i} style={{ whiteSpace: "pre-wrap", marginBottom: 4 }}>{l}</div>)}
      </div>
    </div>

    {showOverlayWin && (
      <div
        onClick={() => setShowOverlayWin(false)}
        style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
          backgroundColor: "rgba(0,0,0,0.6)", display: "flex",
          justifyContent: "center", alignItems: "center", zIndex: 9999, flexDirection: "column"
        }}
      >
        <div style={{ position: "absolute", top: 20, color: "#fff", fontSize: 48, fontWeight: 700, textAlign: "center", width: "100%", fontFamily: 'MyFont' }}>
          Выигрыш! Выплата: {(payoutLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL ; кф = {multiplierDisplay}x
        </div>

        <video
          src="/video/win.mp4"
          autoPlay
          style={{ width: "50%", height: "auto", borderRadius: "12px" }}
          onEnded={() => { setShowOverlayWin(false); }}
        />
      </div>
    )}

    {showOverlayBigWin && (
      <div
        onClick={() => setShowOverlayBigWin(false)}
        style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
          backgroundColor: "rgba(0,0,0,0.6)", display: "flex",
          justifyContent: "center", alignItems: "center", zIndex: 9999, flexDirection: "column"
        }}
      >
        <div style={{ position: "absolute", top: 20, color: "#fff", fontSize: 48, fontWeight: 700, textAlign: "center", width: "100%", fontFamily: 'MyFont' }}>
          Макс Вин!!! Выплата: {(payoutLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL; кф = {multiplierDisplay}x
        </div>

        <video
          src="/video/BigWin.mp4"
          autoPlay
          style={{ width: "50%", height: "auto", borderRadius: "12px" }}
          onEnded={() => { setShowOverlayBigWin(false); }}
        />
      </div>
    )}

    {showOverlayLoss && (
      <div
        onClick={() => setShowOverlayLoss(false)}
        style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
          backgroundColor: "rgba(0,0,0,0.6)", display: "flex",
          justifyContent: "center", alignItems: "center", zIndex: 9999, flexDirection: "column"
        }}
      >
        <div style={{ position: "absolute", top: 20, color: "#fff", fontSize: 90, fontWeight: 700, textAlign: "center", width: "100%", fontFamily: 'MyFont' }}>
          Проигрыш
        </div>

        <video
          src="/video/Loss_5.mp4"
          autoPlay
          style={{ width: "auto", height: "70%", borderRadius: "12px" }}
          onEnded={() => { setShowOverlayLoss(false); }}
        />
      </div>
    )}

    {showOverlayNoMoney && (
      <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
        <div style={{ background: "#fff", padding: 24, borderRadius: 12 }}>
          <h2>Не хватает средств</h2>
          <button onClick={() => setShowOverlayNoMoney(false)}>OK</button>
        </div>
      </div>
    )}
  </div>
);

}
