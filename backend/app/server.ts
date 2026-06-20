import "../lib/load-env.js";
import { createApp } from "./app.js";
import { validateEnv } from "../lib/env.js";

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";

validateEnv();

createApp().listen(port, host, () => {
  console.log(`Eagle Mart backend listening on http://${host}:${port}`);
});
