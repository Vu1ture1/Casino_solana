// scripts/check_pdAs.js
const { Connection, PublicKey, clusterApiUrl } = require("@solana/web3.js");

const RPC = process.env.RPC_URL || clusterApiUrl("devnet");
const connection = new Connection(RPC, "confirmed");

// укажи те же значения, что и в фронте / rust
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "7fw9uBBxhM4pHMg6TG1wji6xJqZEfDST2HRDwMVHvGTw");
const CONFIG_AGENT_SEED = process.env.CONFIG_AGENT_SEED || "config_agent_scratch_v1";
const CONFIG_MAIN_SEED = process.env.CONFIG_MAIN_SEED || "config_scratch_v1";
const VAULT_SEED = process.env.VAULT_SEED || "vault_scratch_v1";
const TREASURY_SEED = process.env.TREASURY_SEED || "treasury_scratch_v1";

(async () => {
  const cfgAgent = await PublicKey.findProgramAddress([Buffer.from(CONFIG_AGENT_SEED)], PROGRAM_ID);
  const cfgMain = await PublicKey.findProgramAddress([Buffer.from(CONFIG_MAIN_SEED)], PROGRAM_ID);
  const vault = await PublicKey.findProgramAddress([Buffer.from(VAULT_SEED)], PROGRAM_ID);
  const treasury = await PublicKey.findProgramAddress([Buffer.from(TREASURY_SEED)], PROGRAM_ID);

  const list = [
    ["config_agent", cfgAgent[0].toBase58()],
    ["config_main", cfgMain[0].toBase58()],
    ["vault", vault[0].toBase58()],
    ["treasury", treasury[0].toBase58()],
  ];

  for (const [name, pk] of list) {
    const info = await connection.getAccountInfo(new PublicKey(pk));
    if (!info) {
      console.log(`${name} (${pk}) — NOT FOUND`);
    } else {
      console.log(`${name} (${pk}) — FOUND; owner: ${info.owner.toBase58()}; lamports: ${info.lamports}; data length: ${info.data.length}`);
    }
  }
  process.exit(0);
})();
