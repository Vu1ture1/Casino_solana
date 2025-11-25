
import { Buffer } from "buffer";
if (typeof window !== "undefined" && !window.Buffer) window.Buffer = Buffer;
if (typeof window !== "undefined" && !window.process) window.process = { env: {} };