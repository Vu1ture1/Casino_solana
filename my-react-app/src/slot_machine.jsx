import React, { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Keypair,
  clusterApiUrl,
} from "@solana/web3.js";

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Orao, randomnessAccountAddress, networkStateAccountAddress } from "@orao-network/solana-vrf";


const CLUSTER = "devnet";
const RPC = clusterApiUrl(CLUSTER);
const PROGRAM_ID = new PublicKey("6zSFSUhQ3qdFDXzqfTxg674pkF7JBoqbm6BmbGmc6DZ4");
const VAULT_SEED = "vault_egor456_v3";
const TREASURY_SEED = "treasury_egor456_v3";


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

  const { publicKey, connected, wallet } = useWallet();

  const [connection] = useState(() => new Connection(RPC, "confirmed"));
  const [anchorProvider, setAnchorProvider] = useState(null);
  const [program, setProgram] = useState(null);
  const [vrfSdk, setVrfSdk] = useState(null);

  const [log, setLog] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [indices, setIndices] = useState(Array.from({ length: visibleCount }, () => Math.floor(Math.random() * images.length)));
  const audioRefs = useRef({});
  const changeIntervals = useRef([]);
  const stopTimeouts = useRef([]);
  const [multValue, setMultValue] = useState("");
  const [solPrice, setSolPrice] = useState(null);
  const [balance, setBalance] = useState(null);
  const [result, setResult] = useState(null);


  const [x, setX] = useState(1.0);


  const [showOverlayWin, setShowOverlayWin] = useState(false);
  const [showOverlayLoss, setShowOverlayLoss] = useState(false);
  const [showOverlayBigWin, setShowOverlayBigWin] = useState(false);
  const [showOverlayNoMoney, setShowOverlayNoMoney] = useState(false);

  function addLog(s) {
    setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${s}`]);
  }

  useEffect(() => {
    audioRefs.current = {
      win: new Audio(audioMap.win),
      smallWin: new Audio(audioMap.smallWin),
      lose: new Audio(audioMap.lose),
    };
    Object.values(audioRefs.current).forEach((a) => { if (a) a.volume = 0.85; });
  }, [audioMap]);

  useEffect(() => {
    if (!connected || !publicKey) return;
    let mounted = true;
    async function upd() {
      try {
        const lamports = await connection.getBalance(publicKey);
        if (!mounted) return;
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (e) {}
    }
    upd();
    const t = setInterval(upd, 3000);
    return () => { mounted = false; clearInterval(t); };
  }, [connected, publicKey, connection]);

  useEffect(() => {
    async function initAnchor() {
      if (!connected || !publicKey) { setAnchorProvider(null); setProgram(null); setVrfSdk(null); return; }
      let walletObj = wallet;
      if (!walletObj && window.solana && window.solana.isPhantom) walletObj = window.solana;
      if (!walletObj) { addLog("No wallet for AnchorProvider"); return; }

      const walletForAnchor = {
        publicKey: walletObj.publicKey || publicKey,
        signTransaction: async (tx) => {
          if (!tx.recentBlockhash) {
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
          }
          tx.feePayer = tx.feePayer || (walletObj.publicKey || publicKey);
          if (typeof walletObj.signTransaction === "function") return await walletObj.signTransaction(tx);
          if (window.solana && typeof window.solana.signTransaction === "function") return await window.solana.signTransaction(tx);
          throw new Error("Wallet does not support signTransaction()");
        },
        signAllTransactions: async (txs) => {
          const { blockhash } = await connection.getLatestBlockhash();
          for (const tx of txs) {
            if (!tx.recentBlockhash) tx.recentBlockhash = blockhash;
            tx.feePayer = tx.feePayer || (walletObj.publicKey || publicKey);
          }
          if (typeof walletObj.signAllTransactions === "function") return await walletObj.signAllTransactions(txs);
          if (window.solana && typeof window.solana.signAllTransactions === "function") return await window.solana.signAllTransactions(txs);
          const out = [];
          for (const tx of txs) out.push(await walletForAnchor.signTransaction(tx));
          return out;
        },
      };

      const aProvider = new AnchorProvider(connection, walletForAnchor, { preflightCommitment: "confirmed" });
      setAnchorProvider(aProvider);

      let idl = null;
      try {
        const resp = await fetch("/idl/slot_machine.json");
        if (resp.ok) idl = await resp.json();
      } catch (e) { /* ignore */ }

      try {
        const prog = new anchor.Program(idl || {}, PROGRAM_ID, aProvider);
        setProgram(prog);
      } catch (e) {
        try { const prog = new anchor.Program(idl || {}, aProvider); setProgram(prog); } catch (ee) { addLog("Failed to construct anchor.Program"); }
      }

      try {
        const v = new Orao(aProvider);
        setVrfSdk(v);
      } catch (e) {
        addLog("Failed to init ORAO SDK: " + (e.message || e.toString()));
      }
    }

    initAnchor();
  }, [connected, publicKey, wallet, connection]);

  async function parseSlotResultFromTx(txSig, maxAttempts = 12) {
    if (!connection) throw new Error("connection not ready");
    addLog("Fetching tx logs: " + txSig);
    let attempt = 0;
    let waitMs = 300;

    while (attempt < maxAttempts) {
      const tx = await connection.getTransaction(txSig, { commitment: "finalized" });
      if (tx && tx.meta && Array.isArray(tx.meta.logMessages)) {
        for (const line of tx.meta.logMessages) {
          if (typeof line !== "string") continue;
          const idx = line.indexOf("SLOT_RESULT:");
          if (idx !== -1) {
            const jsonStr = line.slice(idx + "SLOT_RESULT:".length).trim();
            const obj = JSON.parse(jsonStr);
            const payoutStr = String(obj.payout_net || 0);
            return {
              s0: obj.s0,
              s1: obj.s1,
              s2: obj.s2,
              payoutNetLamports: payoutStr,
              payoutNetSol: Number(payoutStr) / LAMPORTS_PER_SOL,
            };
          }
        }
        throw new Error("SLOT_RESULT not found in transaction logs");
      }
      await new Promise((res) => setTimeout(res, waitMs));
      attempt += 1;
      waitMs = Math.min(1500, Math.floor(waitMs * 1.5));
    }

    const txFinal = await connection.getTransaction(txSig, { commitment: "confirmed" });
    if (txFinal && txFinal.meta && Array.isArray(txFinal.meta.logMessages)) {
      for (const line of txFinal.meta.logMessages) {
        if (typeof line !== "string") continue;
        const idx = line.indexOf("SLOT_RESULT:");
        if (idx !== -1) {
          const jsonStr = line.slice(idx + "SLOT_RESULT:".length).trim();
          const obj = JSON.parse(jsonStr);
          const payoutStr = String(obj.payout_net || 0);
          return {
            s0: obj.s0,
            s1: obj.s1,
            s2: obj.s2,
            payoutNetLamports: payoutStr,
            payoutNetSol: Number(payoutStr) / LAMPORTS_PER_SOL,
          };
        }
      }
    }

    throw new Error("No transaction meta/logs available after retries");
  }

  function getMultiplier(s0, s1, s2) {
    if (s0 === s1 && s1 === s2) {
      switch (s0) {
        case 0: return 100;
        case 1: return 6;
        case 2: return 2;
        case 3: return 25;
        default: return 0;
      }
    }
    if (s0 === s1 || s0 === s2 || s1 === s2) {
      const sym = (s0 === s1) ? s0 : (s0 === s2 ? s0 : s1);
      switch (sym) {
        case 0: return 10;
        case 1: return 2;
        case 2: return 1;
        case 3: return 5;
        default: return 0;
      }
    }
    return 0;
  }

  function mapSymbolToIndex(symbol) {
    const n = images.length;
    if (n <= 4) return symbol % n;
    const groupSize = Math.floor(n / 4) || 1;
    const base = symbol * groupSize;
    return Math.min(base + Math.floor(Math.random() * groupSize), n - 1);
  }

  async function playWithVrf(betLamports) {
    if (!program) throw new Error("Program not ready");
    if (!vrfSdk) throw new Error("VRF SDK not ready");
    const payer = publicKey;

    const [vaultPda] = await PublicKey.findProgramAddress([Buffer.from(VAULT_SEED)], PROGRAM_ID);
    const [treasuryPda] = await PublicKey.findProgramAddress([Buffer.from(TREASURY_SEED)], PROGRAM_ID);

    const forceKeypair = Keypair.generate();
    const seedBytes = forceKeypair.publicKey.toBuffer();
    const randomPda = randomnessAccountAddress(seedBytes);
    const networkStatePda = networkStateAccountAddress();
    addLog("Derived randomness PDA: " + randomPda.toBase58());

    const [betPda] = await PublicKey.findProgramAddress([Buffer.from("bet"), randomPda.toBuffer()], PROGRAM_ID);
    addLog("Derived Bet PDA: " + betPda.toBase58());

    const netState = await vrfSdk.getNetworkState();

    try {
      addLog("Placing bet");
      const placeSig = await program.methods
        .placeBet(new anchor.BN(betLamports))
        .accounts({
          player: payer,
          randomnessAccount: randomPda,
          bet: betPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      addLog("place_bet tx: " + placeSig);
    } catch (e) {
      throw new Error("place_bet failed: " + (e?.message || e?.toString()));
    }

    let requestSig;
    try {
      addLog("Sending request_vrf");
      requestSig = await program.methods
        .requestVrf([...seedBytes])
        .accounts({
          player: payer,
          randomnessAccount: randomPda,
          networkState: networkStatePda,
          vrfTreasury: netState.config.treasury,
          vrfProgram: vrfSdk.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      addLog("request_vrf tx: " + requestSig);
    } catch (e) {
      throw new Error("request_vrf failed: " + (e?.message || e?.toString()));
    }

    try {
      addLog("Waiting for ORAO fulfillment...");
      await vrfSdk.waitFulfilled(seedBytes);
      addLog("ORAO fulfilled randomness");
    } catch (e) {
      throw new Error("waitFulfilled failed: " + (e?.message || e?.toString()));
    }

    let resolveSig;
    try {
      addLog("Sending resolve_bet");
      resolveSig = await program.methods
        .resolveBet() 
        .accounts({
          player: payer,
          randomnessAccount: randomPda,
          bet: betPda,
          vault: vaultPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      addLog("resolve_bet tx: " + resolveSig);
    } catch (e) {
      throw new Error("resolve_bet failed: " + (e?.message || e?.toString()));
    }

    const parsed = await parseSlotResultFromTx(resolveSig);
    return { requestSig, resolveSig, parsed, seedBytes, randomPda, betPda };
  }


  async function startSpin() {
    if (!connected || !publicKey) {
      alert("Подключите кошелёк (Phantom / wallet adapter)");
      return;
    }
    const bet = parseFloat(multValue);
    if (!bet || bet <= 0) {
      alert("Введите ставку (SOL)");
      return;
    }
    const betLamports = Math.floor(bet * LAMPORTS_PER_SOL);

    if (balance !== null && bet > balance) {
      setShowOverlayNoMoney(true);
      return;
    }

    if (spinning) return;
    setSpinning(true);
    setResult(null);
    addLog("Starting spin...");

    changeIntervals.current.forEach((id) => clearInterval(id));
    changeIntervals.current = [];
    for (let pos = 0; pos < visibleCount; pos++) {
      const id = setInterval(() => {
        setIndices((prev) => {
          const next = [...prev];
          next[pos] = (next[pos] + 1) % images.length;
          return next;
        });
      }, changeIntervalMs);
      changeIntervals.current.push(id);
    }

    let parsed;
    try {
      const res = await playWithVrf(betLamports);
      parsed = res.parsed;
      addLog("Chain result: " + JSON.stringify(parsed));
    } catch (e) {
      addLog("Chain error: " + (e.message || e.toString()));
      changeIntervals.current.forEach((id) => clearInterval(id));
      setSpinning(false);
      setShowOverlayLoss(true);
      return;
    }

    changeIntervals.current.forEach((id) => clearInterval(id));
    const finalSymbols = [parsed.s0, parsed.s1, parsed.s2];
    const finalIndices = finalSymbols.map((s) => mapSymbolToIndex(s));
    const stopDelays = [0, 300, 700];
    for (let pos = 0; pos < visibleCount; pos++) {
      ((p) => {
        stopTimeouts.current[p] = setTimeout(() => {
          setIndices((prev) => {
            const next = [...prev];
            next[p] = finalIndices[p];
            return next;
          });
        }, stopDelays[p]);
      })(pos);
    }

    const multiplier = getMultiplier(parsed.s0, parsed.s1, parsed.s2) || 0;
    setX(multiplier);

    const finishDelay = Math.max(...stopDelays) + 300;
    setTimeout(() => {
      setSpinning(false);
      setResult(parsed);
      const payoutLamports = Number(parsed.payoutNetLamports || "0");

      if (payoutLamports > 0) {
        const multFromPayout = betLamports > 0 ? (payoutLamports / betLamports) : 0;
        if (multFromPayout >= 50 || multiplier >= 50) setShowOverlayBigWin(true);
        else setShowOverlayWin(true);

        const a = audioRefs.current.win;
        if (a) a.play().catch(() => {});
      } else {
        setShowOverlayLoss(true);
        const a = audioRefs.current.lose;
        if (a) a.play().catch(() => {});
      }
    }, finishDelay);
  }

  // useEffect(() => { if (showOverlayWin) { const t = setTimeout(() => setShowOverlayWin(false), 3500); return () => clearTimeout(t); } }, [showOverlayWin]);
  // useEffect(() => { if (showOverlayLoss) { const t = setTimeout(() => setShowOverlayLoss(false), 3000); return () => clearTimeout(t); } }, [showOverlayLoss]);
  // useEffect(() => { if (showOverlayBigWin) { const t = setTimeout(() => setShowOverlayBigWin(false), 4500); return () => clearTimeout(t); } }, [showOverlayBigWin]);
  // useEffect(() => { if (showOverlayNoMoney) { const t = setTimeout(() => setShowOverlayNoMoney(false), 3000); return () => clearTimeout(t); } }, [showOverlayNoMoney]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
        const j = await r.json();
        if (!mounted) return;
        setSolPrice(j.solana?.usd ?? null);
      } catch (e) {}
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    return () => { changeIntervals.current.forEach((id) => clearInterval(id)); stopTimeouts.current.forEach((t) => clearTimeout(t)); };
  }, []);

  const normImages = images.map((s) => (typeof s === "string" && !s.startsWith("/") ? "/" + s : s));

  const lamportsToSol = (lamports, decimals = 9) => {
    const sol = Number(lamports) / LAMPORTS_PER_SOL;
    return sol.toFixed(decimals);
  };

  const payoutLamports = Number(result?.payoutNetLamports || "0");
  const payoutSol = payoutLamports / LAMPORTS_PER_SOL;
  const betVal = parseFloat(multValue) || 0;
  const betLamports = Math.floor(betVal * LAMPORTS_PER_SOL);
  const netProfitLamports = Math.max(0, payoutLamports - (betLamports || 0));
  const netProfitSol = netProfitLamports / LAMPORTS_PER_SOL;
  const multiplierDisplay = betLamports > 0 ? (payoutLamports / betLamports) : x;

  return (
    <div style={{ marginTop: 8, padding: 20, fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: "white", borderRadius: 12, padding: 20 }}>
        <h3 style={{ textAlign: "center", fontFamily: "MyFont", fontSize: 40 }}>ДЭП МАШИНА (99,999% выйгрыш)</h3>

        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 16 }}>
          {indices.map((idxVal, pos) => (
            <div key={pos} style={{
              width: imageSize,
              height: imageSize,
              borderRadius: 10,
              overflow: "hidden",
              background: "rgba(0,0,0,0.05)",
              boxShadow: spinning ? "0 8px 24px rgba(0,0,0,0.12)" : "none",
              borderStyle: "outset",
              borderWidth: "5px",
              borderColor: "gold",
            }}>
              <img src={normImages[idxVal]} alt={`slot-${pos}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e)=>{e.currentTarget.style.opacity="0.35"}} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 20 }}>
          <button onClick={startSpin} disabled={spinning || !multValue} style={{
            padding: "8px 14px",
            borderRadius: 8,
            background: spinning ? "#374151" : "linear-gradient(270deg, #FFD700, #FFA500, #FFD700)",
            color: "#fff",
            fontWeight: 600,
            fontFamily: 'MyFont'
          }}>
            {spinning ? "Лудим…" : "Дэп"}
          </button>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 12 }}>
            <input type="number" inputMode="decimal" value={multValue} onChange={(e)=>setMultValue(e.target.value)} placeholder="SOL" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", width: 80, textAlign: "center" }} disabled={spinning} />
            <span style={{ fontWeight: "bold" }}>≈</span>
            <span>{multValue === "" || !solPrice ? 0 : (parseFloat(multValue) * solPrice).toFixed(9)} USD</span>
            <button onClick={() => setMultValue(String((parseFloat(multValue)||0)*2))} style={{ padding: "8px 12px", borderRadius: 8, background: "#512DA8", color: "#fff", fontWeight: 600 }} disabled={spinning}>x2</button>
          </div>
        </div>

        {showOverlayWin && (
          <div style={{ position: "fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999, flexDirection:"column" }}>
            <div style={{ position:"absolute", top:20, color:"#fff", fontSize:65, fontWeight:700, textAlign:"center", width:"100%", fontFamily:'MyFont' }}>
              Выигрыш (чистыми): {netProfitSol.toFixed(9)} SOL — Выплата: {payoutSol.toFixed(9)} SOL; кф = {multiplierDisplay}x
            </div>

            <video src="/video/win.mp4" autoPlay style={{ width:"50%", height:"auto", borderRadius:12 }} onEnded={() => { const audio = document.getElementById("bg-audio"); if (audio) audio.volume = 0.6; setShowOverlayWin(false); }} />
          </div>
        )}

        {showOverlayLoss && (
          <div style={{ position: "fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999, flexDirection:"column" }}>
            <div style={{ position:"absolute", top:20, color:"#fff", fontSize:90, fontWeight:700, textAlign:"center", width:"100%", fontFamily:'MyFont' }}>
              Проигрыш
            </div>
            <video src="/video/loss3.mp4" autoPlay style={{ width:"50%", height:"auto", borderRadius:12 }} onEnded={() => { const audio = document.getElementById("bg-audio"); if (audio) audio.volume = 0.6; setShowOverlayLoss(false); }} />
          </div>
        )}

        {showOverlayBigWin && (
          <div style={{ position: "fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999, flexDirection:"column" }}>
            <div style={{ position:"absolute", top:20, color:"#fff", fontSize:65, fontWeight:700, textAlign:"center", width:"100%", fontFamily:'MyFont' }}>
              Макс вин!!! Чистыми: {netProfitSol.toFixed(9)} SOL — Выплата: {payoutSol.toFixed(9)} SOL; кф = {multiplierDisplay}x
            </div>
            <video src="/video/BigWin.mp4" autoPlay style={{ width:"50%", height:"auto", borderRadius:12 }} onEnded={() => { const audio = document.getElementById("bg-audio"); if (audio) audio.volume = 0.6; setShowOverlayBigWin(false); }} />
          </div>
        )}

        {showOverlayNoMoney && (
          <div style={{ position:"fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999 }}>
            <img src="/images/nomoney.jpg" style={{ width:"50%", height:"auto", borderRadius:12 }} />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <h4 style={{ color: "#000" }}>Result</h4>
          {result ? (
            <div>
              <div>Symbols: {result.s0} — {result.s1} — {result.s2}</div>
              <div>Payout: {result.payoutNetLamports} lamports ({result.payoutNetSol.toFixed(9)} SOL)</div>
              <div>Множитель (client): {getMultiplier(result.s0, result.s1, result.s2)}x</div>
            </div>
          ) : <div>No result yet</div>}
        </div>

        <div style={{ marginTop: 16 }}>
          <h4 style={{ color: "#000" }}>Logs</h4>
          <div style={{ background: "#111", color: "#fff", padding: 10, height: 220, overflow: "auto" }}>
            {log.map((l, i) => <div key={i} style={{ fontSize: 12 }}>{l}</div>)}
          </div>
        </div>

      </div>
    </div>
  );
}
