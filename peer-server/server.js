// Tiny PeerJS broker for Last Car Standing rooms. It only introduces players to each other;
// match data goes straight between devices.
import { PeerServer } from "peer";

const port = Number(process.env.PORT) || 9000;
PeerServer({
  port,
  host: "0.0.0.0",
  path: "/",
  proxied: true, // behind Render/Fly's HTTPS proxy
  allow_discovery: false,
  corsOptions: { origin: true },
});
console.log(`PeerJS broker listening on ${port}`);
