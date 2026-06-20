import "../lib/load-env.js";
import { createApp } from "./app.js";
import { validateEnv } from "../lib/env.js";

const port = Number(process.env.PORT || 4000);

validateEnv();

createApp().listen(port, () => {
  console.log(`Eagle Mart backend listening on http://localhost:${port}`);
});
