import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { SolanaProvider } from "@/components/counter/provider/Solana";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <SolanaProvider>{children}</SolanaProvider>
      </body>
    </html>
  );
}
