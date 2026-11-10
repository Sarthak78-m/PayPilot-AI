import dns from "node:dns";
import { register } from "node:module";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore if unsupported
}

register("./test-loader.mjs", import.meta.url);
