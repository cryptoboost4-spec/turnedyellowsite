// TON's SDKs (built for Node.js originally) reach for Node globals that
// don't exist in a browser — Buffer being the one that actually gets used
// at runtime here. Polyfilled with the standard browser `buffer` package
// rather than assuming the browser has one.
import { Buffer } from "buffer";
globalThis.Buffer = globalThis.Buffer || Buffer;
globalThis.global = globalThis;
