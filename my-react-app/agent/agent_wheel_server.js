const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { Keypair, Connection, clusterApiUrl, PublicKey } = require("@solana/web3.js");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3004;
const CLUSTER = process.env.CLUSTER || "devnet";
const RPC = process.env.RPC_URL || clusterApiUrl(CLUSTER);

const IDL_PATH = process.env.IDL_PATH || path.join(process.cwd(), "wheel_game.json");
const AGENT_KEY_PATH = process.env.AGENT_KEY || path.join(process.cwd(), "agent.json");
const PROGRAM_ID_ENV = process.env.PROGRAM_ID || null;

if (!fs.existsSync(IDL_PATH)) {
  console.error("IDL not found at", IDL_PATH);
  process.exit(1);
}
if (!fs.existsSync(AGENT_KEY_PATH)) {
  console.error("Agent key not found at", AGENT_KEY_PATH);
  process.exit(1);
}

let secret;
try {
  secret = JSON.parse(fs.readFileSync(AGENT_KEY_PATH, "utf8"));
} catch (e) {
  console.error("Failed to parse agent key file:", e.message);
  process.exit(1);
}
const agentKeypair = Keypair.fromSecretKey(Uint8Array.from(secret));
const agentPubkey = agentKeypair.publicKey.toBase58();

const connection = new Connection(RPC, "confirmed");

const agentWallet = {
  publicKey: agentKeypair.publicKey,
  signTransaction: async (tx) => {
    try {
      if (!tx.recentBlockhash) {
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
      }
    } catch (e) {
    }
    tx.feePayer = tx.feePayer || agentKeypair.publicKey;
    tx.partialSign(agentKeypair);
    return tx;
  },
  signAllTransactions: async (txs) => {
    try {
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      for (const tx of txs) {
        if (!tx.recentBlockhash) tx.recentBlockhash = blockhash;
        tx.feePayer = tx.feePayer || agentKeypair.publicKey;
        tx.partialSign(agentKeypair);
      }
    } catch (e) {
      for (const tx of txs) tx.partialSign(agentKeypair);
    }
    return txs;
  },
};

const agentProvider = new anchor.AnchorProvider(connection, agentWallet, { preflightCommitment: "confirmed" });
anchor.setProvider(agentProvider);

let idl = null;
try {
  idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
} catch (e) {
  console.error("Failed to parse IDL at", IDL_PATH, e.message);
  process.exit(1);
}

let program;
try {
  if (PROGRAM_ID_ENV) {
    const pid = new PublicKey(PROGRAM_ID_ENV);
    program = new anchor.Program(idl, pid, agentProvider);
    console.log("Constructed anchor.Program with explicit PROGRAM_ID:", pid.toBase58());
  } else {
    try {
      program = new anchor.Program(idl, agentProvider);
      console.log("Constructed anchor.Program from IDL metadata (if present). ProgramId:", program.programId?.toBase58?.());
    } catch (e) {
      const maybeAddress = (idl?.metadata && idl.metadata.address) || null;
      if (maybeAddress) {
        program = new anchor.Program(idl, new PublicKey(maybeAddress), agentProvider);
        console.log("Constructed anchor.Program using idl.metadata.address:", maybeAddress);
      } else {
        throw e;
      }
    }
  }
} catch (e) {
  console.error("Failed to construct anchor.Program:", e && e.message ? e.message : e);
  console.error("If your IDL does not include program address metadata, set env PROGRAM_ID to the program id.");
  process.exit(1);
}

console.log("Wheel Agent server");
console.log(" Agent pubkey:", agentPubkey);
console.log(" RPC:", RPC);
console.log(" IDL:", IDL_PATH);
console.log(" Program id (from IDL or program):", program.programId?.toBase58?.() ?? "(unknown)");
console.log(" Listening on port", PORT);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function txLogs(txSig, commitment = "confirmed") {
  try {
    const tx = await connection.getTransaction(txSig, { commitment });
    return tx ? tx.meta?.logMessages ?? [] : [];
  } catch (e) {
    return ["failed to fetch tx info: " + e.message];
  }
}

async function waitTxConfirmed(sig, timeoutMs = 60000, pollInterval = 700) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tx = await connection.getTransaction(sig, { commitment: "confirmed" });
      if (tx && tx.meta) return tx;
    } catch (e) {
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return null;
}
app.post("/agent/request", async (req, res) => {
  try {
    const b = req.body || {};
    const required = ["seedPubkey", "randomPda", "networkState", "vrfTreasury", "vrfProgram", "configPda"];
    for (const k of required) if (!b[k]) return res.json({ ok: false, error: `missing ${k}` });

    let seedBuf;
    try {
      seedBuf = new PublicKey(b.seedPubkey).toBuffer();
    } catch (e) {
      try {
        seedBuf = Buffer.from(b.seedPubkey, "base64");
        if (seedBuf.length !== 32) throw new Error("seed length != 32");
      } catch (e2) {
        return res.json({ ok: false, error: "Invalid seedPubkey format (expected base58 pubkey or base64 32-bytes)" });
      }
    }
    const seedArray = Array.from(seedBuf);

    const randomnessAccount = new PublicKey(b.randomPda);
    const networkState = new PublicKey(b.networkState);
    const vrfTreasury = new PublicKey(b.vrfTreasury);
    const vrfProgram = new PublicKey(b.vrfProgram);
    const configPda = new PublicKey(b.configPda);

    console.log(`request_vrf_agent: seed=${b.seedPubkey}, randomPda=${randomnessAccount.toBase58()}`);

    let txSig;
    try {
      txSig = await program.methods
        .requestVrfAgent(seedArray)
        .accounts({
          operator: agentKeypair.publicKey,
          randomnessAccount,
          networkState,
          vrfTreasury,
          vrfProgram,
          config: configPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      const maybeSig = e?.txSig || e?.signature || null;
      const logs = maybeSig ? await txLogs(maybeSig) : (e?.logs ?? []);
      console.error("request_vrf_agent rpc failed:", e && e.stack ? e.stack : e);
      return res.status(500).json({ ok: false, error: String(e.message || e), logs, txSig: maybeSig ?? null });
    }

    console.log("request_vrf_agent rpc returned, txSig:", txSig);

    const txInfo = await waitTxConfirmed(txSig, 60000, 700);
    const logs = txInfo?.meta?.logMessages ?? await txLogs(txSig);

    console.log("request_vrf_agent tx confirmed/fetched logs (count):", logs.length);
    return res.json({ ok: true, txSig, logs });
  } catch (err) {
    console.error("request_vrf_agent failed:", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/agent/resolve", async (req, res) => {
  try {
    const b = req.body || {};
    const required = ["playerPubkey", "randomPda", "betPda", "vaultPda", "treasuryPda", "configPda"];
    for (const k of required) if (!b[k]) return res.json({ ok: false, error: `missing ${k}` });

    const player = new PublicKey(b.playerPubkey);
    const randomnessAccount = new PublicKey(b.randomPda);
    const bet = new PublicKey(b.betPda);
    const vault = new PublicKey(b.vaultPda);
    const treasury = new PublicKey(b.treasuryPda);
    const config = new PublicKey(b.configPda);

    console.log(`resolve_bet: bet=${bet.toBase58()}, player=${player.toBase58()}`);

    let txSig;
    try {
      txSig = await program.methods
        .resolveBet()
        .accounts({
          operator: agentKeypair.publicKey,
          randomnessAccount,
          bet,
          vault,
          treasury,
          player,
          config,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      const maybeSig = e?.txSig || e?.signature || null;
      const logs = maybeSig ? await txLogs(maybeSig) : (e?.logs ?? []);
      console.error("resolve_bet rpc failed:", e && e.stack ? e.stack : e);
      return res.status(500).json({ ok: false, error: String(e?.message || e), logs, txSig: maybeSig ?? null });
    }

    console.log("resolve_bet rpc returned, txSig:", txSig);

    const txInfo = await waitTxConfirmed(txSig, 60000, 700);
    const logs = txInfo?.meta?.logMessages ?? await txLogs(txSig);

    console.log("resolve_bet tx confirmed/fetched logs (count):", logs.length);
    return res.json({ ok: true, txSig, logs });
  } catch (err) {
    console.error("resolve_bet failed:", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/agent/refund", async (req, res) => {
  try {
    const b = req.body || {};
    const required = ["playerPubkey", "randomPda", "betPda", "vaultPda", "configPda"];
    for (const k of required) if (!b[k]) return res.json({ ok: false, error: `missing ${k}` });

    const player = new PublicKey(b.playerPubkey);
    const randomnessAccount = new PublicKey(b.randomPda);
    const bet = new PublicKey(b.betPda);
    const vault = new PublicKey(b.vaultPda);
    const config = new PublicKey(b.configPda);

    const txSig = await program.methods
      .refundBetFromVault()
      .accounts({
         operator: agentKeypair.publicKey,
         randomnessAccount,
         bet,
         vault,
         player,
         config,
         systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const logs = await txLogs(txSig);
    return res.json({ ok: true, txSig, logs });
  } catch (e) {
    console.error("refund failed:", e);
    return res.json({ ok: false, error: String(e), logs: e?.logs ?? null });
  }
});


app.get("/health", (req, res) => {
  res.json({ ok: true, agent: agentPubkey, program: program.programId?.toBase58?.() ?? null });
});

app.listen(PORT, () => {
  console.log(`Wheel Agent listening: http://localhost:${PORT}`);
});
