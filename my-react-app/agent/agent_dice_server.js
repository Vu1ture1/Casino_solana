// agent/agent_server.js
// Express agent for request_vrf_agent / resolve_bet with CORS enabled
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { Keypair, Connection, clusterApiUrl, PublicKey } = require("@solana/web3.js");

// ---------- CONFIG ----------
const PORT = process.env.PORT ? Number(process.env.PORT) : 3003;
const CLUSTER = process.env.CLUSTER || "devnet";
const RPC = clusterApiUrl(CLUSTER);
const IDL_PATH = process.env.IDL_PATH || path.join(process.cwd(), "dice_game.json");
const AGENT_KEY_PATH = process.env.AGENT_KEY || path.join(process.cwd(), "agent.json");
// Note: we're using `new anchor.Program(idl, agentProvider)` and expecting the IDL to contain the
// program address metadata (so no programId arg).
// If your IDL doesn't include address, you can add program address or change to new anchor.Program(idl, programId, provider).

if (!fs.existsSync(IDL_PATH)) {
  console.error("IDL not found at", IDL_PATH);
  process.exit(1);
}
if (!fs.existsSync(AGENT_KEY_PATH)) {
  console.error("Agent key not found at", AGENT_KEY_PATH);
  process.exit(1);
}

// load agent keypair
const secret = JSON.parse(fs.readFileSync(AGENT_KEY_PATH, "utf8"));
const agentKeypair = Keypair.fromSecretKey(Uint8Array.from(secret));
const agentPubkey = agentKeypair.publicKey.toBase58();

// connection & provider for agent
const connection = new Connection(RPC, "confirmed");

// create a minimal wallet object for Anchor provider that signs with our agent keypair
const agentWallet = {
  publicKey: agentKeypair.publicKey,
  signTransaction: async (tx) => {
    // sign locally
    tx.partialSign(agentKeypair);
    return tx;
  },
  signAllTransactions: async (txs) => {
    for (const tx of txs) tx.partialSign(agentKeypair);
    return txs;
  },
};

const agentProvider = new anchor.AnchorProvider(connection, agentWallet, { preflightCommitment: "confirmed" });

// load IDL and Program (using provider-style constructor as you requested)
const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
let program;
try {
  program = new anchor.Program(idl, agentProvider); // <-- using (idl, provider)
} catch (e) {
  console.error("Failed to construct anchor.Program(idl, provider):", e);
  console.error("If your IDL does not include program address metadata, you may need to call new anchor.Program(idl, programId, provider).");
  process.exit(1);
}

console.log("Agent server");
console.log(" Agent pubkey:", agentPubkey);
console.log(" RPC:", RPC);
console.log(" IDL:", IDL_PATH);
console.log(" Program id (from IDL or program):", program.programId?.toBase58?.() ?? "(unknown)");
console.log(" Listening on port", PORT);

// ---------- EXPRESS APP ----------
const app = express();

// allow CORS from any origin (dev). You can restrict to your frontend origin like { origin: 'http://localhost:5173' }
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// helper: fetch tx logs (confirmed)
async function txLogs(txSig) {
  try {
    const tx = await connection.getTransaction(txSig, { commitment: "confirmed" });
    return tx ? tx.meta?.logMessages ?? [] : [];
  } catch (e) {
    return ["failed to fetch tx info: " + e.message];
  }
}

// POST /agent/request
// body: { seedPubkey, randomPda, networkState, vrfTreasury, vrfProgram, configPda }
app.post("/agent/request", async (req, res) => {
  try {
    const b = req.body || {};
    const required = ["seedPubkey", "randomPda", "networkState", "vrfTreasury", "vrfProgram", "configPda"];
    for (const k of required) if (!b[k]) return res.json({ ok: false, error: `missing ${k}` });

    // convert seedPubkey (frontend sends forceKeypair.publicKey.toBase58())
    let seedBuf;
    try {
      seedBuf = new PublicKey(b.seedPubkey).toBuffer(); // gives 32-byte Buffer
    } catch (e) {
      // fallback: if frontend sent base64 or raw, try base64 decode
      try {
        seedBuf = Buffer.from(b.seedPubkey, "base64");
        if (seedBuf.length !== 32) throw new Error("seed length != 32");
      } catch (e2) {
        return res.json({ ok: false, error: "Invalid seedPubkey format (expected base58 pubkey of a Keypair)" });
      }
    }
    const seedArray = Array.from(seedBuf);

    const randomnessAccount = new PublicKey(b.randomPda);
    const networkState = new PublicKey(b.networkState);
    const vrfTreasury = new PublicKey(b.vrfTreasury);
    const vrfProgram = new PublicKey(b.vrfProgram);
    const configPda = new PublicKey(b.configPda);

    console.log(`request_vrf_agent: seed=${b.seedPubkey}, randomPda=${randomnessAccount.toBase58()}`);

    // call the program method (agent signs)
    const txSig = await program.methods
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

    const logs = await txLogs(txSig);
    console.log("request_vrf_agent tx:", txSig);
    // include logs in response for diagnostics
    return res.json({ ok: true, txSig, logs });
  } catch (err) {
    console.error("request_vrf_agent failed:", err && err.stack ? err.stack : err);
    return res.json({ ok: false, error: err.message || String(err) });
  }
});

// POST /agent/resolve
// body: { playerPubkey, randomPda, betPda, vaultPda, treasuryPda, configPda }
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

    const txSig = await program.methods
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

    const logs = await txLogs(txSig);
    console.log("resolve_bet tx:", txSig);
    return res.json({ ok: true, txSig, logs });
  } catch (err) {
    console.error("resolve_bet failed:", err && err.stack ? err.stack : err);
    return res.json({ ok: false, error: err.message || String(err) });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, agent: agentPubkey, program: program.programId?.toBase58?.() ?? null });
});

app.listen(PORT, () => {
  console.log(`Agent listening: http://localhost:${PORT} (CORS enabled)`);
});
