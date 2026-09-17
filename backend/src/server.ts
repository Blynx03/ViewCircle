import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.PORT, () => { console.log(`ViewCircle API listening on port ${env.PORT}`); });

// A bounded room lifetime is enforced even if all browsers stop polling.
import { createExpirySweep } from './services/session-expiry.js';
const sweep = createExpirySweep();
const expirySweep = setInterval(() => { void sweep(); }, 5000);
expirySweep.unref();
