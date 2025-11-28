// src/components/DiceRangeGame.jsx
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
const DEFAULT_PROGRAM_ID = process.env.REACT_APP_DICE_PROGRAM || "9jxkxo2uPSV2XBaPL11MMg2KE3XhaTEq9Dif81UNB6FH";
const PROGRAM_ID = new PublicKey(DEFAULT_PROGRAM_ID);
const AGENT_BASE = process.env.REACT_APP_AGENT_BASE || "http://localhost:3003";

export default function DiceRangeGame() {
  // UI state (как в вашем прежнем прототипе)
  const [rolling, setRolling] = useState(false);
  const [displayValue, setDisplayValue] = useState(null);
  const [finalRoll, setFinalRoll] = useState(null);
  const [leftValue, setLeftValue] = useState(1);
  const [rightValue, setRightValue] = useState(100);
  const [result, setResult] = useState(null);
  const [winAmount, setWinAmount] = useState(0);

  // parity required
  const [parity, setParity] = useState("even");

  const { publicKey, connected, wallet } = useWallet();
  const [balance, setBalance] = useState(null);
  const [multValue, setMultValue] = useState("");
  const [solPrice, setSolPrice] = useState(null);
  const [working, setWorking] = useState(false);
  const [x, setX] = useState(1.5);

  // overlay states for win/loss/bigwin/nomoney
  const [showOverlayWin, setShowOverlayWin] = useState(false);
  const [showOverlayLoss, setShowOverlayLoss] = useState(false);
  const [showOverlayBigWin, setShowOverlayBigWin] = useState(false);
  const [showOverlayNoMoney, setShowOverlayNoMoney] = useState(false);
  const [showOverlayRefund, setShowOverlayRefund] = useState(false);

  // values displayed in overlays
  const [payoutSolDisplay, setPayoutSolDisplay] = useState(0);    // payout to player in SOL
  const [netProfitSolDisplay, setNetProfitSolDisplay] = useState(0); // payout - bet in SOL
  const [multiplierDisplay, setMultiplierDisplay] = useState("0.00"); // string for display


  const animRef = useRef(null);

  // single visible UI log panel
  const [logs, setLogs] = useState([]);
  const logsRef = useRef(null);
  function addLog(msg, level = "info") {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${msg}`;
    // keep last 300 entries
    setLogs((prev) => {
      const out = [...prev, { text: line, level }];
      return out.length > 300 ? out.slice(out.length - 300) : out;
    });
    if (level === "error") console.error(line);
    else console.debug(line);
  }
  useEffect(() => {
    // auto-scroll logs to bottom when new entry arrives
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs.length]);

  const minVal = Math.min(leftValue, rightValue);
  const maxVal = Math.max(leftValue, rightValue);
  const rangeSize = Math.max(1, Math.min(101, maxVal - minVal + 1));
  const universe = 100;
  const probability = (Math.min(rangeSize, 100) / universe) * 100;

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

  useEffect(() => {
    if (!connected || !publicKey) return;
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

  async function getSolPrice() {
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
      const j = await r.json();
      return j.solana?.usd ?? null;
    } catch (e) { return null; }
  }
  useEffect(() => { getSolPrice().then((p)=>setSolPrice(p)); }, []);

  const clamp = (v, a = 1, b = 100) => Math.max(a, Math.min(b, Math.round(v)));
  const onChangeLeft = (raw) => { let v = Number(raw); if (Number.isNaN(v)) return; v = clamp(v); if (v>rightValue) return; setLeftValue(v); };
  const onChangeRight = (raw) => { let v = Number(raw); if (Number.isNaN(v)) return; v = clamp(v); if (v<leftValue) return; setRightValue(v); };
  function multiplyByTwo() { const v = parseFloat(multValue.toString().replace(",", ".")); if (Number.isNaN(v)) return; setMultValue(String(v*2)); }

  // ---------- Anchor / ORAO helpers ----------
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
        for (const tx of txs) {
          tx.recentBlockhash = tx.recentBlockhash || latest.blockhash;
          tx.feePayer = tx.feePayer || publicKey;
        }
        if (wallet && typeof wallet.signAllTransactions === "function") return wallet.signAllTransactions(txs);
        if (window.solana && typeof window.solana.signAllTransactions === "function") return window.solana.signAllTransactions(txs);
        const out = [];
        for (const tx of txs) out.push(await walletForAnchor.signTransaction(tx));
        return out;
      }
    };
    const provider = new AnchorProvider(connection, walletForAnchor, { preflightCommitment: "confirmed" });
    let idl = null;
    try {
      const resp = await fetch("/idl/dice_game.json");
      if (resp.ok) idl = await resp.json();
      addLog("Loaded IDL (dice_game.json) " + (idl ? "ok" : "not found"));
    } catch (e) { addLog("Failed to load IDL: " + (e?.message || e), "error"); }
    const prog = new anchor.Program(idl || {}, provider);
    addLog("Anchor provider & program initialized");
    return { prog, provider };
  }

  async function parseDiceResultFromTx(connection, txSig, maxAttempts = 12) {
    const extract = (line) => {
      if (typeof line !== "string") return null;
      if (line.includes("DICE_RESULT:")) {
        const jsonStr = line.slice(line.indexOf("DICE_RESULT:") + "DICE_RESULT:".length).trim();
        const obj = JSON.parse(jsonStr);
        return { event: "dice",
                number: obj.number,
                left: obj.left,
                right: obj.right,
                even: obj.even,
                payoutNetLamports: BigInt(obj.payout_net || 0),
                payoutNetSol: Number(BigInt(obj.payout_net || 0)) / LAMPORTS_PER_SOL,
                raw: obj };
      }
      if (line.includes("REFUND_RESULT:")) {
        const jsonStr = line.slice(line.indexOf("REFUND_RESULT:") + "REFUND_RESULT:".length).trim();
        const obj = JSON.parse(jsonStr);
        // obj.bet_amount and obj.compensation expected as numbers (lamports)
        return { event: "refund",
                player: obj.player,
                bet_amount: Number(obj.bet_amount || 0),
                compensation: Number(obj.compensation || 0),
                raw: obj };
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
        throw new Error("DICE_RESULT/REFUND_RESULT not found in transaction logs");
      }
      await new Promise((r)=>setTimeout(r, waitMs));
      attempt += 1; waitMs = Math.min(1500, Math.floor(waitMs * 1.5));
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

  async function waitForTxConfirmed(connection, sig, timeoutMs = 90_000) {
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
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    throw new Error("Timeout waiting for tx confirmation: " + sig);
  }

  // Manual polling fallback
  async function waitForRandomnessFulfilledRobust(vrfSdk, connection, seedBytes, randomPda, opts = {}) {
    const { pollIntervalMs = 600, timeoutMs = 120000 } = opts;
    const start = Date.now();
    addLog("Entering robust wait loop for ORAO fulfillment (timeout " + (timeoutMs/1000) + "s) ...");
    while (true) {
      if (Date.now() - start > timeoutMs) {
        addLog("Timeout waiting for ORAO randomness (manual)", "error");
        throw new Error("Timeout waiting for ORAO randomness (manual)");
      }
      const acc = await connection.getAccountInfo(randomPda, "confirmed");
      if (!acc) {
        addLog("Randomness account not created yet (null) — waiting...");
        await new Promise((r)=>setTimeout(r, pollIntervalMs));
        continue;
      }
      const owner = acc.owner?.toBase58?.() ?? String(acc.owner);
      addLog(`Randomness account exists: owner=${owner}, lamports=${acc.lamports}, len=${acc.data?.length ?? null}`);
      try {
        const rs = await vrfSdk.getRandomness(seedBytes);
        const maybe = rs?.data?.request?.randomness ?? rs?.randomness ?? null;
        addLog("vrf.getRandomness() returned; randomness present? " + (maybe ? "YES" : "NO"));
        if (maybe && ((Array.isArray(maybe) && maybe.length>0) || (typeof maybe === "string" && maybe.length>0))) {
          return rs;
        }
      } catch (err) {
        addLog("vrf.getRandomness() decode error (will retry): " + (err?.message || err));
      }
      await new Promise((r)=>setTimeout(r, pollIntervalMs));
    }
  }

  // ---------- main flow ----------
  async function playOnChain() {
    if (!connected || !publicKey) { alert("Подключите кошелёк"); return; }
    if (!isBetValid()) { alert("Введите корректную ставку (SOL)"); return; }
    if (balance !== null) {
      const betSol = parseBet();
      if (!isBetValid() || betSol <= 0) {
        // do nothing here — existing alert handles invalid bets
      } else if (balance <= 0 || betSol > balance) {
        setShowOverlayNoMoney(true);
        // hide overlay automatically after 3s (you can add useEffect for auto-hide), or return immediately
        return;
      }
    }

    setResult(null);
    setFinalRoll(null);
    setWinAmount(0);
    setWorking(true);
    addLog("Starting on-chain play flow...");
    const betSol = parseBet();
    const betLamports = Math.floor(betSol * LAMPORTS_PER_SOL);

    let prog, provider;
    try {
      ({ prog, provider } = await initAnchorForWallet());
    } catch (e) {
      console.error("Anchor init failed:", e);
      addLog("Anchor init failed: " + (e?.message || e), "error");
      setWorking(false); return;
    }
    const connection = provider.connection;
    const vrfSdk = new Orao(provider);

    // PDAs
    const [vaultPda] = await PublicKey.findProgramAddress([Buffer.from("vault_dice_v2")], PROGRAM_ID);
    const [treasuryPda] = await PublicKey.findProgramAddress([Buffer.from("treasury_dice_v2")], PROGRAM_ID);
    const forceKeypair = Keypair.generate();
    const seedBytes = forceKeypair.publicKey.toBuffer();
    const randomPda = randomnessAccountAddress(seedBytes);
    const networkStatePda = networkStateAccountAddress();
    const [betPda] = await PublicKey.findProgramAddress([Buffer.from("bet"), randomPda.toBuffer()], PROGRAM_ID);

    addLog("Derived PDAs: randomPda=" + randomPda.toBase58() + " betPda=" + betPda.toBase58());

    // place_bet (игрок)
    try {
      const left = leftValue, right = rightValue, even = parity === "even";
      const placeSig = await prog.methods
        .placeBet(new BN(betLamports), left, right, even)
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
      console.error("place_bet failed:", e);
      addLog("place_bet failed: " + (e?.message || e), "error");
      setWorking(false);
      alert("place_bet failed: " + (e?.message || e?.toString()));
      return;
    }

    // request_vrf_agent via agent backend
    let requestSig;
    try {
      const netState = await vrfSdk.getNetworkState();
      const payload = {
        seedPubkey: forceKeypair.publicKey.toBase58(),
        randomPda: randomPda.toBase58(),
        networkState: networkStatePda.toBase58(),
        vrfTreasury: netState.config.treasury.toBase58(),
        vrfProgram: vrfSdk.programId.toBase58(),
        configPda: (await PublicKey.findProgramAddress([Buffer.from("config_agent_dice_v2")], PROGRAM_ID))[0].toBase58(),
      };
      addLog("Calling agent /agent/request ...");
      const resp = await fetch(`${AGENT_BASE}/agent/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let j;
      try { j = await resp.json(); } catch (e) { throw new Error("agent returned non-json or network error"); }
      if (!j.ok) {
        addLog("Agent /request returned failure: " + (j.error || JSON.stringify(j)), "error");
        throw new Error("Agent request failure: " + (j.error || "unknown"));
      }
      requestSig = j.txSig;
      addLog("agent.request tx: " + requestSig);
      if (j.logs) {
        addLog("Agent returned logs (" + j.logs.length + " entries)");
      }
    } catch (e) {
      console.error("agent.request failed:", e);
      addLog("agent.request failed: " + (e?.message || e), "error");
      setWorking(false);
      alert("Agent request failed: " + (e?.message || e?.toString()));
      return;
    }

    // --- after agent.request returned requestSig ---
    addLog("agent.request tx: " + requestSig);

    // wait for agent tx to confirm (so randomness account is actually created)
    try {
      await waitForTxConfirmed(connection, requestSig, 90_000); // 90s
    } catch (e) {
      addLog("request tx did not confirm in time: " + (e?.message || e), "error");
      // we continue — fallback poll will catch account when created, but warn user
    }

    // Now try the fast path: vrf.waitFulfilled but with a short timeout
    addLog("Waiting ORAO fulfillment (fast path using vrf.waitFulfilled) ...");
    try {
      const waitFulfilledPromise = vrfSdk.waitFulfilled(seedBytes);
      const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("vrf.waitFulfilled timeout (fast path)")), 20_000)); 
      await Promise.race([waitFulfilledPromise, timeoutPromise]);
      addLog("vrf.waitFulfilled fast path success");
    } catch (fastErr) {
      addLog("Fast path failed or timed out: " + (fastErr?.message || fastErr) + " — falling back to robust polling", "info");
      // robust polling will check account existence + vrf.getRandomness() repeatedly
      try {
        await waitForRandomnessFulfilledRobust(vrfSdk, connection, seedBytes, randomPda, { pollIntervalMs: 700, timeoutMs: 20_000 });
        addLog("Robust polling: ORAO fulfilled");
      } catch (pollErr) {
        addLog("waitForRandomnessFulfilledRobust failed: " + (pollErr?.message || pollErr), "error");
        // === NEW: try to request refund via agent (fallback) ===
        addLog("Попытка инициировать возврат (refund) через агента ...");
        try {
          // build payload for agent refund endpoint
          const refundPayload = {
            playerPubkey: publicKey.toBase58(),
            randomPda: randomPda.toBase58(),
            betPda: betPda.toBase58(),
            vaultPda: vaultPda.toBase58(),
            treasuryPda: treasuryPda.toBase58(),
            configPda: (await PublicKey.findProgramAddress([Buffer.from("config_agent_dice_v2")], PROGRAM_ID))[0].toBase58(),
          };
          addLog("Calling agent /agent/refund ...");
          const refundResp = await fetch(`${AGENT_BASE}/agent/refund`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(refundPayload),
          });

          let refundJson;
          try { refundJson = await refundResp.json(); } catch (e) { throw new Error("agent refund returned non-json or network error"); }
          if (!refundJson.ok) {
            addLog("Agent /refund returned failure: " + (refundJson.error || JSON.stringify(refundJson)), "error");
            throw new Error("Agent refund failure: " + (refundJson.error || "unknown"));
          }

          const refundTxSig = refundJson.txSig;
          addLog("agent.refund tx: " + refundTxSig);

          // wait for refund tx to be confirmed (use existing helper)
          try {
            await waitForTxConfirmed(connection, refundTxSig, 30_000);
            addLog("Refund tx confirmed: " + refundTxSig);
          } catch (e) {
            addLog("Refund tx did not confirm in time: " + (e?.message || e), "error");
            throw e;
          }

          // parse logs for REFUND_RESULT (re-use existing parser)
          try {
            const parsedRefund = await parseDiceResultFromTx(connection, refundTxSig);
            if (parsedRefund.event === "refund") {
              addLog("REFUND_RESULT received via tx: bet_amount=" + parsedRefund.bet_amount + ", compensation=" + parsedRefund.compensation);
              // reuse your UI handling path for refund — set overlay fields:
              const betAmountLam = BigInt(parsedRefund.bet_amount || 0);
              const compLam = BigInt(parsedRefund.compensation || 0);
              const refundTotalLam = betAmountLam + compLam;
              const refundTotalSol = Number(refundTotalLam) / LAMPORTS_PER_SOL;
              const betSolLocal = parseBet();

              setPayoutSolDisplay(refundTotalSol);
              const netProfit = refundTotalSol - betSolLocal;
              setNetProfitSolDisplay(netProfit);
              setMultiplierDisplay(betSolLocal > 0 ? (refundTotalSol / betSolLocal).toFixed(2) : "0.00");

              setResult("refund");
              setShowOverlayRefund(true);
            } else {
              addLog("Refund tx did not contain REFUND_RESULT event (got " + parsedRefund.event + ")", "error");
              alert("Refund transaction executed but REFUND_RESULT not found in logs. Проверьте транзакцию: " + refundTxSig);
            }
          } catch (e) {
            addLog("Failed to parse refund tx logs: " + (e?.message || e), "error");
            alert("Не удалось распарсить возвратную транзакцию. Проверьте в explorer: " + refundTxSig);
          }
        } catch (refundErr) {
          console.error("agent.refund failed:", refundErr);
          addLog("agent.refund failed: " + (refundErr?.message || refundErr), "error");
          // last-resort: notify user
          alert("Не дождались ORAO randomness и возврат через агента не удался: " + (refundErr?.message || refundErr).toString());
        } finally {
          setWorking(false);
        }
        // stop normal flow after refund attempt
        return;
      }
    }

    // resolve via agent
    let resolveSig;
    try {
      const payload2 = {
        playerPubkey: publicKey.toBase58(),
        randomPda: randomPda.toBase58(),
        betPda: betPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        treasuryPda: treasuryPda.toBase58(),
        configPda: (await PublicKey.findProgramAddress([Buffer.from("config_agent_dice_v2")], PROGRAM_ID))[0].toBase58(),
      };
      addLog("Calling agent /agent/resolve ...");
      const resp2 = await fetch(`${AGENT_BASE}/agent/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload2),
      });
      const j2 = await resp2.json();
      if (!j2.ok) {
        addLog("Agent resolve returned failure: " + (j2.error || JSON.stringify(j2)), "error");
        throw new Error("agent resolve failed: " + (j2.error || "unknown"));
      }
      resolveSig = j2.txSig;
      addLog("agent.resolve tx: " + resolveSig);
      if (j2.logs) addLog("Agent resolve returned logs (" + j2.logs.length + " entries)");
    } catch (e) {
      console.error("agent.resolve failed:", e);
      addLog("agent.resolve failed: " + (e?.message || e), "error");
      setWorking(false);
      alert("Agent resolve failed: " + (e?.message || e?.toString()));
      return;
    }

    // parse result + overlay handling
    let parsed;
    // parse result
    try {
       parsed = await parseDiceResultFromTx(connection, resolveSig);

         // ======= DEBUG: временный форс рефанда для тестирования =======
  // const FORCE_REFUND_TEST = true; // <- поставьте true чтобы протестировать, false чтобы вернуть нормальное поведение
  // if (FORCE_REFUND_TEST) {
  //   addLog("DEBUG: forcing REFUND_RESULT (test mode)");
  //   // betLamports уже есть выше в функции
  //   const COMPENSATION_LAMPORTS = Math.floor(0.00146 * LAMPORTS_PER_SOL); // компенсация в лампортах
  //   parsed = {
  //     event: "refund",
  //     player: publicKey.toBase58(),
  //     bet_amount: betLamports,      // существующая переменная number (lamports)
  //     compensation: COMPENSATION_LAMPORTS
  //   };
  // } else {
  //   parsed = await parseDiceResultFromTx(connection, resolveSig);
  // }
  // ==============================================================

      if (parsed.event === "refund") {
        // refund: bet_amount + compensation are lamports
        const betAmountLam = BigInt(parsed.bet_amount || 0);
        const compLam = BigInt(parsed.compensation || 0);
        const refundTotalLam = betAmountLam + compLam;
        const refundTotalSol = Number(refundTotalLam) / LAMPORTS_PER_SOL;
        const betSolLocal = betSol;

        // set UI values for overlay
        setPayoutSolDisplay(refundTotalSol); // total returned to player
        const netProfit = refundTotalSol - betSolLocal;
        setNetProfitSolDisplay(netProfit);
        setMultiplierDisplay(betSolLocal > 0 ? (refundTotalSol / betSolLocal).toFixed(2) : "0.00");

        addLog(`REFUND_RESULT received: bet_amount=${parsed.bet_amount} lamports, compensation=${parsed.compensation} lamports`);
        // mark UI state
        setResult("refund");
        setShowOverlayRefund(true);

      } else if (parsed.event === "dice") {
        // standard dice result
        const payoutNetLam = parsed.payoutNetLamports; // BigInt
        const payoutNetSol = Number(payoutNetLam) / LAMPORTS_PER_SOL; // net profit (as used previously)
        const betSolLocal = betSol;

        // compute total payout (assuming payout_net is "net" profit)
        const totalPayoutSol = betSolLocal + payoutNetSol;

        setFinalRoll(parsed.number);
        setDisplayValue(parsed.number);
        setResult(payoutNetLam > 0n ? "win" : "lose");
        setWinAmount(payoutNetSol);
        setX(((Number(payoutNetLam) / betLamports) || 0).toFixed(2));

        // prepare overlay fields
        setPayoutSolDisplay(totalPayoutSol);        // total paid to player (stake + net)
        setNetProfitSolDisplay(payoutNetSol);       // net profit (may be 0)
        setMultiplierDisplay(betSolLocal > 0 ? (totalPayoutSol / betSolLocal).toFixed(2) : "0.00");

        addLog("Parsed DICE_RESULT: number=" + parsed.number + " payout_net=" + payoutNetLam.toString());
        // overlays: big/small win decided below after we compute parity/in-range
        const number = parsed.number;
        const inRange = number >= parsed.left && number <= parsed.right;
        const numberIsEven = (number % 2) === 0;
        const parityMatched = (parsed.even === numberIsEven);

        if (inRange && parityMatched && payoutNetLam > 0n) {
          setShowOverlayBigWin(true);
        } else if (payoutNetLam > 0n) {
          setShowOverlayWin(true);
        } else {
          setShowOverlayLoss(true);
        }
      } else {
        throw new Error("Unknown event type from logs");
      }

    } catch (e) {
      console.error("Failed to parse result:", e);
      addLog("Failed to parse result: " + (e?.message || e), "error");
      alert("Не удалось распарсить результат. Проверьте транзакцию в explorer и логи агента.");
    } finally {
      setWorking(false);
    }
  } // end playOnChain

  // ---------- UI ----------
  const rangeLeftPercent = ((minVal - 1) / 99) * 100;
  const rangeWidthPercent = ((maxVal - minVal + 1) / 100) * 100;

  const baseMultiplier = 40 / rangeSize; // например 40/40 = 1.0
  const baseMultiplierStr = baseMultiplier.toFixed(2);

  // Жёстко захардкоденные коэффициенты паритета (как ты просил)
  const PARITY_WIN_MULT = 1.1;  // если паритет угадан
  const PARITY_LOSS_MULT = 0.7; // если паритет не угадан

  // Возможные комбинированные множители (перед броском мы показываем оба сценария)
  const combinedIfParityCorrect = baseMultiplier * PARITY_WIN_MULT;
  const combinedIfParityWrong = baseMultiplier * PARITY_LOSS_MULT;
  const combinedIfParityCorrectStr = combinedIfParityCorrect.toFixed(2);
  const combinedIfParityWrongStr = combinedIfParityWrong.toFixed(2);

  return (
    <div style={{ maxWidth: "80%", backgroundColor: "white", gap: "10px", borderRadius: 12, padding: "25px", fontFamily: "system-ui, sans-serif" }}>
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
        .range-slider::-moz-range-track { height: 6px; background: #eee; border-radius: 6px; border: none; }
        .range-slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 3px solid #111827; box-shadow: 0 4px 10px rgba(0,0,0,0.12); cursor: pointer; }
      `}</style>

      <h2 style={{ marginBottom: 6, fontFamily: 'MyFont' }}>Игра: Йа'Куб</h2>
      <p style={{ color: "#444" }}>Кидай кубик d100, выбери диапазон. Паритет обязателен (по умолчанию - чётное).</p>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={playOnChain} disabled={!isBetValid() || working} style={{ padding: "8px 14px", borderRadius: 8, background: "#ffd700", fontWeight: 700 }}>
            {working ? "Выполняется..." : "Кинуть (on-chain)"}
          </button>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="number" value={multValue} onChange={(e)=>setMultValue(e.target.value)} placeholder="SOL" style={{ width: 80 }} />
            <span>≈</span>
            <span>{multValue === "" || !solPrice ? 0 : (parseFloat(multValue) * solPrice).toFixed(9)} USD</span>
            <button onClick={multiplyByTwo} style={{ padding: "8px 12px", borderRadius: 8, background: "#512DA8", color: "#fff", fontWeight: 600 }}>x2</button>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <div style={{ minWidth: 100 }}>Левая граница:</div>
            <input type="number" value={leftValue} onChange={(e)=>onChangeLeft(e.target.value)} disabled={rolling} style={{ width: 80 }} />
            <div style={{ marginLeft: 12 }}>Правая граница:</div>
            <input type="number" value={rightValue} onChange={(e)=>onChangeRight(e.target.value)} disabled={rolling} style={{ width: 80 }} />
            <div style={{ marginLeft: "auto" }}>Диапазон: <strong>{minVal} - {maxVal}</strong> (размер: {rangeSize})</div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Левый ползунок: {leftValue}</div>
            <input type="range" className="range-slider" min={1} max={100} step={1} value={leftValue} onChange={(e) => onChangeLeft(Number(e.target.value))} disabled={rolling} />
          </div>

          <div>
            <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Правый ползунок: {rightValue}</div>
            <input type="range" className="range-slider" min={1} max={100} step={1} value={rightValue} onChange={(e) => onChangeRight(Number(e.target.value))} disabled={rolling} />
          </div>

          <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>Вероятность: <strong>{probability.toFixed(2)}%</strong></div>
        </div>

        {/* parity (required) */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" name="parity" value="even" checked={parity === "even"} onChange={() => setParity("even")} disabled={rolling} />
            Чётное
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" name="parity" value="odd" checked={parity === "odd"} onChange={() => setParity("odd")} disabled={rolling} />
            Нечётное
          </label>

          <div style={{ marginLeft: "auto", color: "#777", fontSize: 13, textAlign: "right" }}>
            <div>Паритет обязателен и будет отправлен в контракт.</div>

            {/* Показываем базовый множитель и паритетные варианты */}
            <div style={{ marginTop: 6 }}>
              Базовый множитель (по диапазону): <strong>{baseMultiplierStr}x</strong>
            </div>
            <div style={{ marginTop: 4 }}>
              Если вы угадаете паритет - дополнительный множитель: <strong>{PARITY_WIN_MULT}x</strong>.
            </div>
            <div style={{ marginTop: 2 }}>
              Если НЕ угадаете паритет - дополнительный множитель: <strong>{PARITY_LOSS_MULT}x</strong>.
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
              Итого потенциальный множитель (если попадёте в диапазон):<br />
              - при верном паритете: <strong>{combinedIfParityCorrectStr}x</strong><br />
              - при неверном паритете: <strong>{combinedIfParityWrongStr}x</strong>
            </div>
          </div>
        </div>

        <div style={{ position: "relative", height: 64, marginTop: 24 }}>
          <div style={{ height: 12, background: "#eee", borderRadius: 8, position: "relative" }}>
            <div style={{ position: "absolute", left: `${rangeLeftPercent}%`, width: `${rangeWidthPercent}%`, top: 0, bottom: 0, background: "rgba(16,185,129,0.18)" }} />
          </div>

          <div style={{ position: "absolute", top: -36, left: `${displayValue !== null ? (displayValue / 100) * 100 : 0}%`, transform: "translateX(-50%)", transition: rolling ? "none" : "left 300ms ease" }}>
            <div style={{ minWidth: 32, textAlign: "center", padding: "6px 8px", background: "#111827", color: "#fff", borderRadius: 8, fontWeight: 800 }}>
              {displayValue === null ? "-" : displayValue}
            </div>
          </div>

          <div style={{ position: "absolute", left: 0, right: 0, top: 24, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
            <span>1</span><span>25</span><span>50</span><span>75</span><span>100</span>
          </div>
        </div>

        {/* показываем результат только когда мы НЕ ждём (working=false) */}
        {!working && result && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: result === "win" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.06)" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{result === "win" ? "Победа!" : "Проигрыш"}</div>
            <div>Выпало: <strong>{finalRoll}</strong></div>
            <div>Выигрыш: <strong>{winAmount.toFixed(9)} SOL</strong> (кф ≈ {x}x)</div>
            <div>Диапазон: <strong>{minVal} - {maxVal}</strong></div>
            <div>Паритет: <strong>{parity === "even" ? "Чётное" : "Нечётное"}</strong></div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
              Теоретический множитель (диапазон × паритет): <strong>{combinedIfParityCorrectStr}x</strong> (если паритет верен), <strong>{combinedIfParityWrongStr}x</strong> (если нет).
            </div>
          </div>
        )}
      </div>

      {showOverlayWin && (
        <div style={{ position: "fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999, flexDirection:"column" }}>
          <div style={{ position:"absolute", top:20, color:"#fff", fontSize:65, fontWeight:700, textAlign:"center", width:"100%", fontFamily:'MyFont' }}>
            Профит: {netProfitSolDisplay.toFixed(9)} SOL - Выплата: {payoutSolDisplay.toFixed(9)} SOL; кф = {multiplierDisplay}x
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
            Макс вин!!! Профит: {netProfitSolDisplay.toFixed(9)} SOL - Выплата: {payoutSolDisplay.toFixed(9)} SOL; кф = {multiplierDisplay}x
          </div>
          <video src="/video/BigWin.mp4" autoPlay style={{ width:"50%", height:"auto", borderRadius:12 }} onEnded={() => { const audio = document.getElementById("bg-audio"); if (audio) audio.volume = 0.6; setShowOverlayBigWin(false); }} />
        </div>
      )}

      {showOverlayRefund && (
      <div style={{ position: "fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999, flexDirection:"column" }}>
        <div style={{ position:"absolute", top:20, color:"#fff", fontSize:44, fontWeight:700, textAlign:"center", width:"100%", fontFamily:'MyFont' }}>
          Возврат ставки: {netProfitSolDisplay >= 0 ? "компенсация" : ""} — Чистыми: {netProfitSolDisplay.toFixed(9)} SOL
        </div>

        {/* можно заменить видео на ваш файл (или показать статичную картинку) */}
        <video src="/video/loss3.mp4" autoPlay style={{ width:"50%", height:"auto", borderRadius:12 }} onEnded={() => { setShowOverlayRefund(false); }} />
      </div>
    )}

      {showOverlayNoMoney && (
        <div style={{ position:"fixed", top:0, left:0, width:"100%", height:"100%", backgroundColor:"rgba(0,0,0,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:9999 }}>
          <img src="/images/nomoney.jpg" style={{ width:"50%", height:"auto", borderRadius:12 }} />
        </div>
      )}

      {/* single logs panel */}
      <div style={{ marginTop: 18 }}>
        <h4 style={{ marginBottom: 8 }}>Logs (last {logs.length})</h4>
        <div ref={logsRef} style={{ background: "#0b1220", color: "#d1e7ff", padding: 10, height: 180, overflow: "auto", fontSize: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>
          {logs.length === 0 ? <div style={{ opacity: 0.6 }}>- no logs yet -</div> : logs.map((l, i) => (
            <div key={i} style={{ color: l.level === "error" ? "#ffb4b4" : "#d1e7ff", marginBottom: 4 }}>{l.text}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
