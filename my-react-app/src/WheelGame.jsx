// src/components/WheelGame.jsx
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
import BN from "bn.js";

const CLUSTER = "devnet";
const RPC = clusterApiUrl(CLUSTER);
const DEFAULT_PROGRAM_ID = process.env.REACT_APP_WHEEL_PROGRAM || "5CBsiiCU7K9pzNxzmSs7r1sw8UhjsHYWA5srQtm7uDqt";
const PROGRAM_ID = new PublicKey(DEFAULT_PROGRAM_ID);
const AGENT_BASE = process.env.REACT_APP_AGENT_BASE || "http://localhost:3004";

export default function WheelGame() {
  const { publicKey, connected, wallet } = useWallet();

  // logs
  const [logs, setLogs] = useState([]);
  const logsRef = useRef(null);
  function addLog(msg, level = "info") {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${msg}`;
    setLogs((prev) => {
      const out = [...prev, { text: line, level }];
      return out.length > 500 ? out.slice(out.length - 500) : out;
    });
    if (level === "error") console.error(line);
    else console.debug(line);
  }


  // on-chain state
  const [working, setWorking] = useState(false);
  const [betValue, setBetValue] = useState("0.001");
  const [finalText, setFinalText] = useState(null);
  const [payoutSol, setPayoutSol] = useState(0);
    // balance (для проверки NoMoney)
  const [balance, setBalance] = useState(null);

    useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, [logs.length]);
    useEffect(() => {
    if (!connected || !publicKey) { setBalance(null); return; }
    const conn = new Connection(RPC, "confirmed");
    let mounted = true;
    async function updateBalance() {
      try {
        const lamports = await conn.getBalance(publicKey);
        if (!mounted) return;
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (e) {
        addLog("Balance fetch failed: " + (e?.message || e), "error");
      }
    }
    updateBalance();
    const interval = setInterval(updateBalance, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, [connected, publicKey]);

  // wheel UI state
  const [spinningInfinite, setSpinningInfinite] = useState(false); // infinite spin while waiting
  const [rotationDeg, setRotationDeg] = useState(0); // current applied rotation (deg)
  const [isTransitioningToResult, setIsTransitioningToResult] = useState(false); // when we animate to result
  const [resultNumber, setResultNumber] = useState(null); // final number 1..100

  // --- add these for refund UI ---
  const [showOverlayRefund, setShowOverlayRefund] = useState(false);
  const [showOverlayWin, setShowOverlayWin] = useState(false);
  const [showOverlayLoss, setShowOverlayLoss] = useState(false);
  const [showOverlayBigWin, setShowOverlayBigWin] = useState(false);
  const [showOverlayNoMoney, setShowOverlayNoMoney] = useState(false);
  const [payoutSolDisplay, setPayoutSolDisplay] = useState(0);
  const [netProfitSolDisplay, setNetProfitSolDisplay] = useState(0);
  const [multiplierDisplay, setMultiplierDisplay] = useState("0.00");


  const wheelRef = useRef(null);
  const transitionResolveRef = useRef(null); // to await transition end if needed
  const cumulativeBaseRotRef = useRef(0); // maintain base rotation between spins

  // constants for wheel drawing
  const N_SECTORS = 100;
  const SECTOR_ANGLE = 360 / N_SECTORS; // 3.6
  const WHEEL_SIZE = 360; // px (SVG viewport)
  const R = WHEEL_SIZE / 2; // radius
  const OUTER_R = R - 4;
  const INNER_R = 0;

  // categories definition (same as in Rust)
  const categories = [
    { start: 1, end: 5, bps: 0 },        // 1..5 -> 0.0
    { start: 6, end: 18, bps: 7500 },    // 6..18 -> 0.75
    { start: 19, end: 30, bps: 12500 },  // 19..30 -> 1.25
    { start: 31, end: 50, bps: 10000 },  // 31..50 -> 1.0
    { start: 51, end: 65, bps: 15000 },  // 51..65 -> 1.5
    { start: 66, end: 80, bps: 20000 },  // 66..80 -> 2.0
    { start: 81, end: 95, bps: 5000 },   // 81..95 -> 0.5
    { start: 96, end: 99, bps: 100000 }, // 96..99 -> 10.0
    { start: 100, end: 100, bps: 500000 } // 100 -> 50.0
  ];

  // color palette for categories (distinct)
  const categoryColors = [
    "#bdbdbd", // 0.0 gray
    "#60a5fa", // 0.75 light blue
    "#34d399", // 1.25 turquoise/green
    "#4ade80", // 1.0 green
    "#fb923c", // 1.5 orange
    "#facc15", // 2.0 yellow
    "#a78bfa", // 0.5 purple
    "#f97373", // 10.0 red
    "#f59e0b"  // 50.0 gold
  ];

  // helper: pick category color by sector index (1..100)
  function colorForIndex(idx1) {
    // idx1: 1..100
    for (let ci = 0; ci < categories.length; ci++) {
      const c = categories[ci];
      if (idx1 >= c.start && idx1 <= c.end) return categoryColors[ci];
    }
    return "#cccccc";
  }

  // build sectors array once
  const sectors = (() => {
    const arr = [];
    for (let i = 1; i <= N_SECTORS; i++) {
      // label optionally every 5 or 10
      arr.push({
        num: i,
        color: colorForIndex(i),
      });
    }
    return arr;
  })();

  // draw wedge path for sector i (1-based)
  function wedgePath(i) {
    // angle start measured from -90deg (12 o'clock) clockwise
    const startAngle = -90 + (i - 1) * SECTOR_ANGLE;
    const endAngle = startAngle + SECTOR_ANGLE;
    const sx = R + OUTER_R * Math.cos((Math.PI / 180) * startAngle);
    const sy = R + OUTER_R * Math.sin((Math.PI / 180) * startAngle);
    const ex = R + OUTER_R * Math.cos((Math.PI / 180) * endAngle);
    const ey = R + OUTER_R * Math.sin((Math.PI / 180) * endAngle);
    const largeArc = SECTOR_ANGLE > 180 ? 1 : 0;
    return `M ${R} ${R} L ${sx} ${sy} A ${OUTER_R} ${OUTER_R} 0 ${largeArc} 1 ${ex} ${ey} Z`;
  }

  // utility: wait for transition end on wheel
  function waitForTransitionEnd(el) {
    return new Promise((resolve) => {
      if (!el) return resolve();
      const handler = (e) => {
        // only care about transform transitions
        if (e.propertyName && e.propertyName !== "transform") return;
        el.removeEventListener("transitionend", handler);
        resolve();
      };
      el.addEventListener("transitionend", handler);
      // safety timeout
      setTimeout(() => {
        try { el.removeEventListener("transitionend", handler); } catch {}
        resolve();
      }, 6000);
    });
  }

  // --- On-chain helpers (copied/kept from your code) ---
  async function initAnchorForWallet() {
    if (!connected || !publicKey) throw new Error("Wallet not connected");
    const connection = new Connection(RPC, "confirmed");
    const walletForAnchor = {
      publicKey: publicKey,
      signTransaction: async (tx) => {
        const latest = await connection.getLatestBlockhash("finalized");
        tx.recentBlockhash = tx.recentBlockhash || latest.blockhash;
        tx.feePayer = tx.feePayer || publicKey;
        if (wallet && typeof wallet.signTransaction === "function") return wallet.signTransaction(tx);
        if (window.solana && typeof window.solana.signTransaction === "function") return window.solana.signTransaction(tx);
        throw new Error("Wallet doesn't support signTransaction");
      },
      signAllTransactions: async (txs) => {
        const latest = await connection.getLatestBlockhash("finalized");
        for (const tx of txs) { tx.recentBlockhash = tx.recentBlockhash || latest.blockhash; tx.feePayer = tx.feePayer || publicKey; }
        if (wallet && typeof wallet.signAllTransactions === "function") return wallet.signAllTransactions(txs);
        if (window.solana && typeof window.solana.signAllTransactions === "function") return window.solana.signAllTransactions(txs);
        const out = [];
        for (const tx of txs) out.push(await walletForAnchor.signTransaction(tx));
        return out;
      }
    };
    const provider = new AnchorProvider(connection, walletForAnchor, { preflightCommitment: "confirmed" });
    let idl = null;
    try { const resp = await fetch("/idl/wheel_game.json"); if (resp.ok) idl = await resp.json(); addLog("Loaded IDL wheel_game.json " + (idl ? "ok" : "not found")); } catch (e) { addLog("Failed to load IDL: " + e?.message, "error"); }
    const prog = new anchor.Program(idl || {}, provider);
    addLog("Anchor provider & program initialized");
    return { prog, provider };
  }

  async function parseWheelResultFromTx(connection, txSig, maxAttempts = 12) {
    const extract = (line) => {
      if (typeof line !== "string") return null;
      const wheelIdx = line.indexOf("WHEEL_RESULT:");
      if (wheelIdx !== -1) {
        const jsonStr = line.slice(wheelIdx + "WHEEL_RESULT:".length).trim();
        const obj = JSON.parse(jsonStr);
        return {
          event: "wheel",
          number: obj.number,
          multiplier_bps: obj.multiplier_bps,
          payoutNetLamports: BigInt(obj.payout_net || 0),
          payoutNetSol: Number(BigInt(obj.payout_net || 0)) / LAMPORTS_PER_SOL,
          raw: obj
        };
      }
      const refundIdx = line.indexOf("REFUND_RESULT:");
      if (refundIdx !== -1) {
        const jsonStr = line.slice(refundIdx + "REFUND_RESULT:".length).trim();
        const obj = JSON.parse(jsonStr);
        return {
          event: "refund",
          player: obj.player,
          bet_amount: Number(obj.bet_amount || 0),
          compensation: Number(obj.compensation || 0),
          raw: obj
        };
      }
      return null;
    };

    let attempt = 0, waitMs = 300;
    while (attempt < maxAttempts) {
      const tx = await connection.getTransaction(txSig, { commitment: "finalized" });
      if (tx && tx.meta && Array.isArray(tx.meta.logMessages)) {
        for (const line of tx.meta.logMessages) {
          const r = extract(line);
          if (r) return r;
        }
        throw new Error("WHEEL_RESULT/REFUND_RESULT not found in transaction logs");
      }
      await new Promise((r) => setTimeout(r, waitMs));
      attempt += 1;
      waitMs = Math.min(1500, Math.floor(waitMs * 1.5));
    }

    const txFinal = await new Connection(RPC, "confirmed").getTransaction(txSig, { commitment: "confirmed" });
    if (txFinal && txFinal.meta && Array.isArray(txFinal.meta.logMessages)) {
      for (const line of txFinal.meta.logMessages) {
        const r = extract(line);
        if (r) return r;
      }
    }

    throw new Error("No transaction meta/logs available after retries");
  }

  async function waitForRandomnessFulfilledRobust(vrfSdk, connection, seedBytes, randomPda, opts = {}) {
    const { pollIntervalMs = 700, timeoutMs = 180000 } = opts;
    const start = Date.now();
    addLog("Entering robust wait loop for ORAO fulfillment (timeout " + (timeoutMs/1000) + "s) ...");
    while (true) {
      if (Date.now() - start > timeoutMs) throw new Error("Timeout waiting for ORAO randomness (manual)");
      const acc = await connection.getAccountInfo(randomPda, "confirmed");
      if (!acc) {
        await new Promise((r)=>setTimeout(r, pollIntervalMs));
        continue;
      }
      try {
        const rs = await vrfSdk.getRandomness(seedBytes);
        const maybe = rs?.data?.request?.randomness ?? rs?.randomness ?? null;
        if (maybe && ((Array.isArray(maybe) && maybe.length>0) || (typeof maybe === "string" && maybe.length>0))) {
          addLog("vrf.getRandomness indicates randomness present");
          return rs;
        }
      } catch (err) {
        addLog("vrf.getRandomness() decode error (will retry): " + (err?.message || err));
      }
      await new Promise((r)=>setTimeout(r, pollIntervalMs));
    }
  }

  // helper: wait until randomness account exists (so vrf.waitFulfilled won't fail early)
  async function waitForAccountCreated(connection, pubkey, timeoutMs = 60000, pollIntervalMs = 700) {
    const start = Date.now();
    while (true) {
      if (Date.now() - start > timeoutMs) throw new Error("Timeout waiting for account creation: " + pubkey.toBase58());
      try {
        const acc = await connection.getAccountInfo(pubkey, "confirmed");
        if (acc) return acc;
      } catch (e) { /* ignore */ }
      await new Promise((r)=>setTimeout(r, pollIntervalMs));
    }
  }

  // helper: wait until a tx appears as confirmed (polling)
  async function waitForTxConfirmed(connection, sig, timeoutMs = 30_000) {
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
        // ignore transient RPC errors
        // but log occasionally to help debugging
        // addLog("tx confirm poll error: " + (e?.message || e), "info");
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    throw new Error("Timeout waiting for tx confirmation: " + sig);
  }


  // main flow: spin wheel on chain
  async function spinWheelOnChain() {
    if (!connected || !publicKey) { alert("Подключите кошелёк"); return; }
    const betSol = parseFloat(String(betValue).replace(",", "."));
    if (Number.isNaN(betSol) || betSol <= 0) { alert("Введите корректную ставку"); return; }
    if (balance !== null) {
      if (betSol <= 0) {
        // handled earlier
      } else if (balance <= 0 || betSol > balance) {
        setShowOverlayNoMoney(true);
        // optionally auto-hide later; stop flow
        setWorking(false);
        setSpinningInfinite(false);
        return;
      }
    }

    setWorking(true);
    setFinalText(null);
    setPayoutSol(0);
    setResultNumber(null);
    setIsTransitioningToResult(false);

    addLog("Starting wheel spin on-chain flow...");

    let prog, provider;
    try { ({ prog, provider } = await initAnchorForWallet()); } catch (e) { addLog("Anchor init failed: " + (e?.message || e), "error"); setWorking(false); return; }
    const connection = provider.connection;
    const vrfSdk = new Orao(provider);

    // PDAs & randomness
    const [vaultPda] = await PublicKey.findProgramAddress([Buffer.from("vault_wheel_v1")], PROGRAM_ID);
    const [treasuryPda] = await PublicKey.findProgramAddress([Buffer.from("treasury_wheel_v1")], PROGRAM_ID);
    const forceKeypair = Keypair.generate();
    const seedBytes = forceKeypair.publicKey.toBuffer();
    const randomPda = randomnessAccountAddress(seedBytes);
    const networkStatePda = networkStateAccountAddress();
    const [betPda] = await PublicKey.findProgramAddress([Buffer.from("bet"), randomPda.toBuffer()], PROGRAM_ID);

    addLog("Derived PDAs: randomPda=" + randomPda.toBase58() + " betPda=" + betPda.toBase58());

    // start infinite spinning UI immediately
    setSpinningInfinite(true);

    // place_bet (player)
    const betLamports = Math.floor(betSol * LAMPORTS_PER_SOL);
    try {
      const placeSig = await prog.methods
        .placeBet(new BN(betLamports))
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
      addLog("place_bet failed: " + (e?.message || e), "error");
      setWorking(false);
      setSpinningInfinite(false);
      return;
    }

    // agent.request
    let requestSig;
    try {
      const netState = await vrfSdk.getNetworkState();
      const payload = {
        seedPubkey: forceKeypair.publicKey.toBase58(),
        randomPda: randomPda.toBase58(),
        networkState: networkStatePda.toBase58(),
        vrfTreasury: netState.config.treasury.toBase58(),
        vrfProgram: vrfSdk.programId.toBase58(),
        configPda: (await PublicKey.findProgramAddress([Buffer.from("config_agent_wheel_v2")], PROGRAM_ID))[0].toBase58(),
      };
      addLog("Calling wheel agent /agent/request ...");
      const resp = await fetch(`${AGENT_BASE}/agent/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await resp.json();
      if (!j.ok) throw new Error(j.error || "agent request failed");
      requestSig = j.txSig;
      addLog("agent.request tx: " + requestSig);
      if (j.logs) addLog("Agent logs: " + JSON.stringify(j.logs.slice(0,6)));
    } catch (e) {
      addLog("agent.request failed: " + (e?.message || e), "error");
      setWorking(false);
      setSpinningInfinite(false);
      return;
    }

    // wait for randomness account creation before using waitFulfilled
    try {
      addLog("Waiting for randomness account to appear...");
      const acc = await waitForAccountCreated(connection, randomPda, 60000, 700);
      addLog(`Randomness account exists: owner=${acc.owner.toBase58()} len=${acc.data.length}`);
    } catch (e) {
      addLog("Randomness account not created in time: " + (e?.message || e), "error");
      setWorking(false);
      setSpinningInfinite(false);
      return;
    }

    // wait for ORAO fulfillment (fast path + robust fallback)
    addLog("Waiting ORAO fulfillment (fast path) ...");
    try {
      const waitFulfilledPromise = vrfSdk.waitFulfilled(seedBytes);
      const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("vrf.waitFulfilled timeout (fast path)")), 20000)); // 30s
      await Promise.race([waitFulfilledPromise, timeoutPromise]);
      addLog("vrf.waitFulfilled fast path success");
    } catch (fastErr) {
      addLog("Fast path failed/timeout: " + (fastErr?.message || fastErr) + " — falling back to robust polling");
      try {
        await waitForRandomnessFulfilledRobust(vrfSdk, connection, seedBytes, randomPda, { pollIntervalMs: 700, timeoutMs: 20000 });
        addLog("Robust polling: ORAO fulfilled");
      } catch (pollErr) {
        addLog("Randomness wait failed: " + (pollErr?.message || pollErr), "error");
        setSpinningInfinite(false);
        // === try to request refund via agent ===
        addLog("Попытка инициировать возврат (refund) через агента ...");
        try {
          const payloadRefund = {
            playerPubkey: publicKey.toBase58(),
            randomPda: randomPda.toBase58(),
            betPda: betPda.toBase58(),
            vaultPda: vaultPda.toBase58(),
            treasuryPda: treasuryPda.toBase58(),
            configPda: (await PublicKey.findProgramAddress([Buffer.from("config_agent_wheel_v2")], PROGRAM_ID))[0].toBase58(),
          };
          addLog("Calling agent /agent/refund ...");
          const refundResp = await fetch(`${AGENT_BASE}/agent/refund`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadRefund),
          });
          const refundJson = await refundResp.json().catch(()=>{ throw new Error("agent refund returned non-json"); });
          if (!refundJson.ok) {
            addLog("Agent /refund returned failure: " + (refundJson.error || JSON.stringify(refundJson)), "error");
            throw new Error("Agent refund failure: " + (refundJson.error || "unknown"));
          }
          const refundTx = refundJson.txSig;
          addLog("agent.refund tx: " + refundTx);

          // wait for refund tx confirm
          try {
            await waitForTxConfirmed(connection, refundTx, 30_000);
            addLog("Refund tx confirmed: " + refundTx);
          } catch (e) {
            addLog("Refund tx did not confirm in time: " + (e?.message || e), "error");
            throw e;
          }

          // parse refund logs
          const parsedRefund = await parseWheelResultFromTx(connection, refundTx);
          if (parsedRefund.event === "refund") {
            addLog("REFUND_RESULT received via tx: bet_amount=" + parsedRefund.bet_amount + ", compensation=" + parsedRefund.compensation);
            const betAmountLam = BigInt(parsedRefund.bet_amount || 0);
            const compLam = BigInt(parsedRefund.compensation || 0);
            const refundTotalLam = betAmountLam + compLam;
            const refundTotalSol = Number(refundTotalLam) / LAMPORTS_PER_SOL;
            const betSolLocal = betSol; // betSol defined earlier in this function

            setPayoutSolDisplay(refundTotalSol);
            const netProfit = refundTotalSol - betSolLocal;
            setNetProfitSolDisplay(netProfit);
            setMultiplierDisplay(betSolLocal > 0 ? (refundTotalSol / betSolLocal).toFixed(2) : "0.00");

            setResultNumber(null);
            setFinalText(`Refunded ${refundTotalSol.toFixed(9)} SOL`);
            setShowOverlayRefund(true);
          } else {
            addLog("Refund tx executed but REFUND_RESULT not found", "error");
            alert("Refund tx executed but REFUND_RESULT not found in logs. Проверьте транзакцию: " + refundTx);
          }
        } catch (refundErr) {
          addLog("agent.refund failed: " + (refundErr?.message || refundErr), "error");
          // notify user
          alert("Не дождались ORAO randomness и возврат через агента не удался: " + (refundErr?.message || refundErr).toString());
        } finally {
          setSpinningInfinite(false);
          setWorking(false);
        }
        return;
      }
    }

    // agent.resolve
    let resolveSig;
    try {
      const payload2 = {
        playerPubkey: publicKey.toBase58(),
        randomPda: randomPda.toBase58(),
        betPda: betPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        treasuryPda: treasuryPda.toBase58(),
        configPda: (await PublicKey.findProgramAddress([Buffer.from("config_agent_wheel_v2")], PROGRAM_ID))[0].toBase58(),
      };
      addLog("Calling wheel agent /agent/resolve ...");
      const resp2 = await fetch(`${AGENT_BASE}/agent/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload2),
      });
      const j2 = await resp2.json();
      if (!j2.ok) throw new Error(j2.error || "agent resolve failed");
      resolveSig = j2.txSig;
      addLog("agent.resolve tx: " + resolveSig);
    } catch (e) {
      addLog("agent.resolve failed: " + (e?.message || e), "error");
      setWorking(false);
      setSpinningInfinite(false);
      return;
    }

    let parsed;
    try {
      parsed = await parseWheelResultFromTx(connection, resolveSig);
      addLog("Parsed WHEEL_RESULT: num=" + parsed.number + " bps=" + parsed.multiplier_bps + " payout_net=" + parsed.payoutNetLamports.toString());
    } catch (e) {
      addLog("Failed to parse WHEEL_RESULT: " + (e?.message || e), "error");
      // гарантируем очистку UI-флагов при ошибке
      setSpinningInfinite(false);
      setWorking(false);
      setFinalText("Error parsing result; check logs");
      return;
    }

    // теперь безопасно используем parsed
    const targetNum = parsed.number; // 1..100
    setResultNumber(targetNum);
    setPayoutSol(parsed.payoutNetSol);
    setFinalText(parsed.payoutNetLamports > 0n ? `You won ${parsed.payoutNetSol} SOL` : "You lost");

    // compute target rotation:
    // sector center angle (as drawn) = -90 + (n-1)*SECTOR_ANGLE + SECTOR_ANGLE/2
    const sectorCenter = -90 + (targetNum - 1) * SECTOR_ANGLE + (SECTOR_ANGLE / 2);

    // We want sectorCenter + rotation = -90  (i.e. center at 12 o'clock)
    // => rotation = -90 - sectorCenter
    const desiredFinal = -90 - sectorCenter;

    // add some full rotations for drama (choose >0)
    const extraFull = 3 + Math.floor(Math.random() * 3); // 3..5 extra spins

    // targetTotal is cumulative base + extra full turns + desired final offset
    const targetTotal = cumulativeBaseRotRef.current + extraFull * 360 + desiredFinal;


    // stop infinite spin visually:
    setSpinningInfinite(false);
    // small timeout to allow CSS class change to take effect before triggering transition
    await new Promise((r)=>setTimeout(r, 80));

    // set transition (animate to targetTotal)
    // set current rotation to cumulativeBaseRotRef.current (so smooth)
    setRotationDeg(cumulativeBaseRotRef.current % 360);
    // small delay to ensure DOM updated then apply transition
    await new Promise((r)=>setTimeout(r, 40));
    // start transition
    setIsTransitioningToResult(true);
    setRotationDeg(targetTotal);

    // wait for transition end
    const el = wheelRef.current;
    await waitForTransitionEnd(el);

    // finalize: store new base rotation (mod 360 to keep numbers small)
    cumulativeBaseRotRef.current = targetTotal % 360;
    setIsTransitioningToResult(false);
    setWorking(false);

    // --- overlay selection based on multiplier thresholds ---
    // parsed.multiplier_bps expected from contract logs (bps: 10000 == 1.0)
    const multiplierBps = Number(parsed.multiplier_bps || 0);
    const multiplier = multiplierBps / 10000; // e.g. 15000 -> 1.5
    const betSolLocal = betSol; // betSol defined at top of spinWheelOnChain
    // computed total payout and net profit
    const totalPayoutSol = betSolLocal * multiplier;
    const netProfitSol = parsed.payoutNetSol; // already net profit from logs

    // set overlay display values
    setPayoutSolDisplay(totalPayoutSol);
    setNetProfitSolDisplay(netProfitSol);
    setMultiplierDisplay(multiplier.toFixed(2));

    // decide which overlay to show:
    // Loss: multiplier < 1.0
    // Win (small): multiplier > 1.0 && multiplier < 10.0
    // BigWin: multiplier >= 10.0 && multiplier <= 50.0
    // (you can fine-tune thresholds if needed)
    if (multiplier < 1.0) {
      setShowOverlayLoss(true);
      setShowOverlayWin(false);
      setShowOverlayBigWin(false);
    } else if (multiplier >= 10.0 && multiplier <= 50.0) {
      setShowOverlayBigWin(true);
      setShowOverlayWin(false);
      setShowOverlayLoss(false);
    } else if (multiplier > 1.0 && multiplier < 10.0) {
      setShowOverlayWin(true);
      setShowOverlayLoss(false);
      setShowOverlayBigWin(false);
    } else {
      // fallback (e.g. multiplier == 1.0) — consider it a loss/no-win
      setShowOverlayLoss(true);
      setShowOverlayWin(false);
      setShowOverlayBigWin(false);
    }

    // show result message (already set finalText)
    addLog(`Wheel stopped at ${targetNum}. ${parsed.payoutNetLamports > 0n ? "WIN" : "LOSE"}`);
  } // end spinWheelOnChain

  // wheel transform style depends on spinningInfinite / isTransitioningToResult / rotationDeg
  const wheelTransform = `rotate(${rotationDeg}deg)`;

  // dynamic style for wheel: if spinningInfinite -> apply CSS animation; else transition to rotationDeg
  const wheelContainerStyle = {
    width: 360,
    height: 360,
    borderRadius: "50%",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 30px rgba(2,6,23,0.12)",
    position: "relative",
    margin: "0 auto",
  };

  // style for pointer at top
  const pointerStyle = {
    position: "absolute",
    top: -8,
    left: "50%",
    transform: "translateX(-50%) rotate(180deg)", // <- rotate 180° flips the triangle
    zIndex: 20,
    width: 0,
    height: 0,
    borderLeft: "12px solid transparent",
    borderRight: "12px solid transparent",
    borderBottom: "24px solid #ef4444",
    filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.2))"
  };

  return (
    <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
      <style>{`
        /* infinite spin */
        @keyframes wheelSpinInfinite {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .wheel-rotation-infinite {
          animation: wheelSpinInfinite 1.2s linear infinite;
        }
        .wheel-rotation-transition {
          transition: transform 4s cubic-bezier(.22,.9,.18,1); /* nice deceleration */
        }
        .panel {
          width: 100%;
          max-width: 980px;
          background: #fff;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 8px 40px rgba(2,6,23,0.08);
        }
        .logs-box {
          background: #0b1220;
          color: #d1e7ff;
          padding: 10px;
          margin-top: 16px;
          border-radius: 8px;
          height: 200px;
          overflow: auto;
          font-size: 12px;
        }
      `}</style>

      <div className="panel">
        <h2 style={{ margin: "0 0 6px 0" }}>Fortune Wheel</h2>
        <div style={{ color: "#444", marginBottom: 12 }}>Spin the wheel — payout depends on the landed sector (1–100).</div>

        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ width: 380 }}>
            <div style={{ position: "relative" }}>
              <div style={pointerStyle} />
              <div style={wheelContainerStyle}>
                <div
                  ref={wheelRef}
                  style={{
                    width: WHEEL_SIZE,
                    height: WHEEL_SIZE,
                    transformOrigin: "50% 50%",
                    transform: wheelTransform,
                    borderRadius: "50%",
                    overflow: "visible",
                    ...(spinningInfinite ? { animation: "wheelSpinInfinite 1.2s linear infinite" } : {}),
                    ...(isTransitioningToResult ? { transition: "transform 4s cubic-bezier(.22,.9,.18,1)" } : {}),
                  }}
                >
                  <svg width={WHEEL_SIZE} height={WHEEL_SIZE} viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`} style={{ display: "block" }}>
                    <g>
                      {sectors.map((s, idx) => (
                        <path key={idx} d={wedgePath(idx + 1)} fill={s.color} stroke="#111827" strokeWidth="0.6" />
                      ))}
                      {/* optional center circle */}
                      <circle cx={R} cy={R} r={36} fill="#111827" />
                      <text x={R} y={R} textAnchor="middle" fill="#fff" dy="8" fontWeight="700" fontSize="14">SPIN</text>
                    </g>
                  </svg>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
              <label style={{ width: 80 }}>Bet (SOL):</label>
              <input value={betValue} onChange={(e)=>setBetValue(e.target.value)} style={{ width: 140, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <button onClick={spinWheelOnChain} disabled={working} style={{ padding: "10px 14px", borderRadius: 8, background: "#16a34a", color: "#fff", marginLeft: 8 }}>
                {working ? "Working..." : "Spin (on-chain)"}
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 14 }}>{finalText ?? "-"}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>Payout: {payoutSol.toFixed(9)} SOL</div>
              <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
                Result number: <strong style={{ fontSize: 18 }}>{resultNumber === null ? "-" : resultNumber}</strong>
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <h4 style={{ marginTop: 0 }}>Legend (categories)</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {categories.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, borderRadius: 8, border: "1px solid #f1f5f9" }}>
                  <div style={{ width: 24, height: 24, background: categoryColors[i], borderRadius: 4 }} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{c.start}{c.end !== c.start ? `–${c.end}` : ""}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{(c.bps/10000).toFixed(2)}× ({c.bps} bps)</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18 }}>
              <h4 style={{ marginBottom: 8 }}>Controls / Diagnostics</h4>
              <div style={{ fontSize: 13, color: "#666" }}>
                - Wheel spins while waiting for ORAO. When result comes, it decelerates and lands on sector.<br/>
                - If you see incorrect payouts: check config PDAs & agent logs.
              </div>
            </div>
          </div>
        </div>

        {showOverlayRefund && (
          <div style={{ position: "fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999, flexDirection:"column" }}>
            <div style={{ position:"absolute", top:20, color:"#fff", fontSize:44, fontWeight:700, textAlign:"center", width:"100%", fontFamily:'MyFont' }}>
              Возврат: Выплата {payoutSolDisplay.toFixed(9)} SOL — Чистыми: {netProfitSolDisplay.toFixed(9)} SOL; кф = {multiplierDisplay}x
            </div>
            <video src="/video/loss3.mp4" autoPlay style={{ width:"50%", height:"auto", borderRadius:12 }} onEnded={() => { setShowOverlayRefund(false); }} />
          </div>
        )}

         {showOverlayWin && (
          <div style={{ position: "fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999, flexDirection:"column" }}>
            <div style={{ position:"absolute", top:20, color:"#fff", fontSize:44, fontWeight:700, textAlign:"center", width:"100%", fontFamily:'MyFont' }}>
              Победа! Выигрыш: {netProfitSolDisplay.toFixed(9)} SOL — Выплата: {payoutSolDisplay.toFixed(9)} SOL; кф = {multiplierDisplay}x
            </div>
            <video src="/video/win.mp4" autoPlay style={{ width:"50%", height:"auto", borderRadius:12 }} onEnded={() => { setShowOverlayWin(false); }} />
          </div>
        )}

        {showOverlayLoss && (
          <div style={{ position: "fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999, flexDirection:"column" }}>
            <div style={{ position:"absolute", top:20, color:"#fff", fontSize:90, fontWeight:700, textAlign:"center", width:"100%", fontFamily:'MyFont' }}>
              Проигрыш
            </div>
            <video src="/video/loss3.mp4" autoPlay style={{ width:"50%", height:"auto", borderRadius:12 }} onEnded={() => { setShowOverlayLoss(false); }} />
          </div>
        )}

        {showOverlayBigWin && (
          <div style={{ position: "fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999, flexDirection:"column" }}>
            <div style={{ position:"absolute", top:20, color:"#fff", fontSize:56, fontWeight:800, textAlign:"center", width:"100%", fontFamily:'MyFont' }}>
              Большой выигрыш!!! Профит: {netProfitSolDisplay.toFixed(9)} SOL — Выплата: {payoutSolDisplay.toFixed(9)} SOL; кф = {multiplierDisplay}x
            </div>
            <video src="/video/BigWin.mp4" autoPlay style={{ width:"60%", height:"auto", borderRadius:12 }} onEnded={() => { setShowOverlayBigWin(false); }} />
          </div>
        )}

        {showOverlayNoMoney && (
          <div style={{ position:"fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999 }}>
            <img src="/images/nomoney.jpg" style={{ width:"50%", height:"auto", borderRadius:12 }} />
          </div>
        )}

        {/* logs bottom */}
        <div style={{ marginTop: 18 }}>
          <h4 style={{ marginBottom: 8 }}>Logs (last {logs.length})</h4>
          <div ref={logsRef} className="logs-box">
            {logs.length === 0 ? <div style={{ opacity: 0.6 }}>- no logs yet -</div> : logs.map((l,i)=>(
              <div key={i} style={{ color: l.level === "error" ? "#ffb4b4" : "#d1e7ff", marginBottom: 6 }}>{l.text}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
