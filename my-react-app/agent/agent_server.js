// agent_server.js
// Run: AGENT_KEY=/full/path/agent.json node agent_server.js

const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const anchor = require("@coral-xyz/anchor");
const { Keypair, Connection, clusterApiUrl, PublicKey, SystemProgram } = require("@solana/web3.js");

const PORT = process.env.AGENT_PORT ? Number(process.env.AGENT_PORT) : 3001;
const CLUSTER = process.env.CLUSTER || "devnet";
const RPC = process.env.RPC_URL || clusterApiUrl(CLUSTER);
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "6zSFSUhQ3qdFDXzqfTxg674pkF7JBoqbm6BmbGmc6DZ4");

// load agent key from AGENT_KEY env
const agentKeyPath = process.env.AGENT_KEY;
if (!agentKeyPath) {
  console.error("AGENT_KEY env not set. Export AGENT_KEY=/full/path/agent.json");
  process.exit(1);
}
if (!fs.existsSync(agentKeyPath)) {
  console.error("Agent key file not found:", agentKeyPath);
  process.exit(1);
}
let secret;
try {
  secret = JSON.parse(fs.readFileSync(agentKeyPath, "utf8"));
} catch (e) {
  console.error("Failed to parse agent key file:", e.message);
  process.exit(1);
}
const agentKeypair = Keypair.fromSecretKey(Uint8Array.from(secret));
console.log("Agent pubkey:", agentKeypair.publicKey.toBase58());

// load IDL (expect it in same folder, name slot_machine.json)
const idlPath = path.join(__dirname, "slot_machine.json");
if (!fs.existsSync(idlPath)) {
  console.error("IDL file slot_machine.json not found in agent folder. Copy target/idl/slot_machine.json here.");
  process.exit(1);
}
const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

// connection + anchor provider
const connection = new Connection(RPC, "confirmed");

// wallet wrapper that signs with agent keypair
const walletForAnchor = {
  publicKey: agentKeypair.publicKey,
  signTransaction: async (tx) => {
    // ensure recent blockhash & feePayer
    if (!tx.recentBlockhash) {
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
    }
    tx.feePayer = tx.feePayer || agentKeypair.publicKey;
    tx.partialSign(agentKeypair);
    return tx;
  },
  signAllTransactions: async (txs) => {
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    for (const tx of txs) {
      if (!tx.recentBlockhash) tx.recentBlockhash = blockhash;
      tx.feePayer = tx.feePayer || agentKeypair.publicKey;
      tx.partialSign(agentKeypair);
    }
    return txs;
  },
};

const provider = new anchor.AnchorProvider(connection, walletForAnchor, anchor.AnchorProvider.defaultOptions());
anchor.setProvider(provider);

// Program object bound to agent provider (agent will sign txs)
const program = new anchor.Program(idl, provider);

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));

app.get("/", (req, res) => res.send("Agent alive. public key: " + agentKeypair.publicKey.toBase58()));
app.get("/health", (req, res) => res.json({ ok: true, pubkey: agentKeypair.publicKey.toBase58() }));

/**
 * POST /agent/request
 * body:
 * {
 *   "seedPubkey": "<32-byte seed publickey base58> (forceKeypair.publicKey.toBase58())",
 *   "randomPda": "<randomness account base58>",
 *   "networkState": "<network_state PDA base58>",
 *   "vrfTreasury": "<ORAO treasury pubkey base58>",
 *   "vrfProgram": "<ORAO program id base58>",
 *   "configPda": "<config PDA base58>"
 * }
 *
 * Response: { ok: true, txSig: "..." }
 *
 * NOTE: This endpoint makes the program call that CPI's into ORAO; agent will pay ORAO fees.
 */
app.post("/agent/request", async (req, res) => {
  try {
    const body = req.body || {};
    const required = ["seedPubkey", "randomPda", "networkState", "vrfTreasury", "vrfProgram", "configPda"];
    for (const k of required) {
      if (!body[k]) return res.status(400).json({ ok: false, error: `missing ${k}` });
    }

    // parse inputs
    const seedPubkey = new PublicKey(body.seedPubkey);
    const randomnessAccount = new PublicKey(body.randomPda);
    const networkState = new PublicKey(body.networkState);
    const vrfTreasury = new PublicKey(body.vrfTreasury);
    const vrfProgram = new PublicKey(body.vrfProgram);
    const config = new PublicKey(body.configPda);

    // seed bytes array for Anchor call – program-side expects [u8;32]
    const seedBytes = [...seedPubkey.toBuffer()]; // array of 32 numbers

    console.log("Agent: sending request_vrf (operator) for seed", seedPubkey.toBase58(), "randomPda", randomnessAccount.toBase58());

    // NOTE: your Rust program must expose an instruction that allows operator to call request_vrf (e.g. request_vrf_agent)
    // The method name below should match the instruction name in Anchor-generated IDL.
    // Try requestVrfAgent / requestVrfAgentV2 as appropriate (case/anchor mapping).
    const txSig = await program.methods
      .requestVrfAgent(seedBytes) // <--- must match IDL: request_vrf_agent -> requestVrfAgent
      .accounts({
        operator: agentKeypair.publicKey,
        randomnessAccount: randomnessAccount,
        networkState: networkState,
        vrfTreasury: vrfTreasury,
        vrfProgram: vrfProgram,
        config: config,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("request_vrf_agent tx:", txSig);
    return res.json({ ok: true, txSig });
  } catch (e) {
    console.error("agent request error:", e);
    return res.status(500).json({ ok: false, error: String(e), logs: e?.logs ?? null });
  }
});

/**
 * POST /agent/resolve
 * body: same as before
 */
app.post("/agent/resolve", async (req, res) => {
  try {
    const body = req.body || {};
    const required = ["playerPubkey", "randomPda", "betPda", "vaultPda", "treasuryPda", "configPda"];
    for (const k of required) {
      if (!body[k]) return res.status(400).json({ ok: false, error: `missing ${k}` });
    }

    const player = new PublicKey(body.playerPubkey);
    const randomnessAccount = new PublicKey(body.randomPda);
    const bet = new PublicKey(body.betPda);
    const vault = new PublicKey(body.vaultPda);
    const treasury = new PublicKey(body.treasuryPda);
    const config = new PublicKey(body.configPda);

    console.log("Agent: sending resolve_bet for player", player.toBase58(), "bet", bet.toBase58());

    const txSig = await program.methods
      .resolveBet()
      .accounts({
        player: player,
        randomnessAccount: randomnessAccount,
        bet: bet,
        vault: vault,
        treasury: treasury,
        operator: agentKeypair.publicKey,
        config: config,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("resolve_bet tx:", txSig);
    return res.json({ ok: true, txSig });
  } catch (e) {
    console.error("agent resolve error:", e);
    return res.status(500).json({ ok: false, error: String(e), logs: e?.logs ?? null });
  }
});

app.listen(PORT, () => {
  console.log(`Agent server listening on http://localhost:${PORT}`);
});
