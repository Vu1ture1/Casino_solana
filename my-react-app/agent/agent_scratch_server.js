
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const anchor = require("@coral-xyz/anchor");
const { Keypair, Connection, clusterApiUrl, PublicKey, SystemProgram } = require("@solana/web3.js");

const PORT = process.env.AGENT_SCRATCH_PORT ? Number(process.env.AGENT_SCRATCH_PORT) : 3002;
const CLUSTER = process.env.CLUSTER || "devnet";
const RPC = process.env.RPC_URL || clusterApiUrl(CLUSTER);
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID_SCRATCH || "7fw9uBBxhM4pHMg6TG1wji6xJqZEfDST2HRDwMVHvGTw");

const agentKeyPath = process.env.AGENT_KEY || path.join(process.cwd(), "agent.json");;
if (!agentKeyPath) {
  console.error("AGENT_KEY env not set. Export AGENT_KEY=/full/path/agent_scratch.json");
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
console.log("Scratch Agent pubkey:", agentKeypair.publicKey.toBase58());

const idlPath = path.join(__dirname, "scratch_card.json");
if (!fs.existsSync(idlPath)) {
  console.error("IDL file scratch_card.json not found in agent folder. Copy target/idl/scratch_card.json here.");
  process.exit(1);
}
const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

const connection = new Connection(RPC, "confirmed");

const walletForAnchor = {
  publicKey: agentKeypair.publicKey,
  signTransaction: async (tx) => {
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
const program = new anchor.Program(idl, provider);

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));

app.get("/", (req, res) => res.send("Scratch Agent alive. public key: " + agentKeypair.publicKey.toBase58()));
app.get("/health", (req, res) => res.json({ ok: true, pubkey: agentKeypair.publicKey.toBase58() }));

app.post("/agent/request", async (req, res) => {
  try {
    const body = req.body || {};
    const required = ["seedPubkey", "randomPda", "networkState", "vrfTreasury", "vrfProgram", "configPda"];
    for (const k of required) {
      if (!body[k]) return res.status(400).json({ ok: false, error: `missing ${k}` });
    }

    const seedPubkey = new PublicKey(body.seedPubkey);
    const randomnessAccount = new PublicKey(body.randomPda);
    const networkState = new PublicKey(body.networkState);
    const vrfTreasury = new PublicKey(body.vrfTreasury);
    const vrfProgram = new PublicKey(body.vrfProgram);
    const config = new PublicKey(body.configPda);

    const seedBytes = [...seedPubkey.toBuffer()];

    console.log("Scratch Agent: sending request_vrf_agent for seed", seedPubkey.toBase58(), "randomPda", randomnessAccount.toBase58());

    const txSig = await program.methods
      .requestVrfAgent(seedBytes)
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

    const maxWaitMs = 60_000; 
    const start = Date.now();
    let confirmed = false;
    while (Date.now() - start < maxWaitMs) {
      try {
        const tx = await connection.getTransaction(txSig, { commitment: "confirmed" });
        if (tx && tx.meta) {
          confirmed = true;
          break;
        }
      } catch (e) {  }
      await new Promise((r) => setTimeout(r, 600));
    }
    if (!confirmed) {
      console.warn("request_vrf_agent: tx did not confirm within timeout:", txSig);
      return res.json({ ok: true, txSig, note: "tx_not_confirmed_within_timeout" });
    }

    console.log("request_vrf_agent confirmed:", txSig);
    return res.json({ ok: true, txSig });
  } catch (e) {
    console.error("agent/request error:", e);
    return res.status(500).json({ ok: false, error: String(e), logs: e?.logs ?? null });
  }
});

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

    console.log("Scratch Agent: sending resolve_bet for player", player.toBase58(), "bet", bet.toBase58());

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
    console.error("agent/resolve error:", e);
    return res.status(500).json({ ok: false, error: String(e), logs: e?.logs ?? null });
  }
});

app.listen(PORT, () => {
  console.log(`Scratch agent server listening on http://localhost:${PORT}`);
});
