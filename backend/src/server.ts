import { app } from './app.js';
import { env } from './config/env.js';

app.locals.sessionRecoveryPending = true;
app.listen(env.PORT, () => { console.log(`ViewCircle API listening on port ${env.PORT}`); });

// A bounded room lifetime is enforced even if all browsers stop polling.
import { createExpirySweep } from './services/session-expiry.js';
const sweep = createExpirySweep();
const expirySweep = setInterval(() => { void sweep(); }, 5000);
expirySweep.unref();

// Memory-backed authorizations cannot recover across restarts. Close only this
// application's orphaned media rooms and retry control-plane failures.
import { orphanedRooms, expireRoom } from './services/livekit-service.js';
import { sessionStore } from './stores/session-store.js';
let reconciling = false;
const reconcileOrphans = async () => {
  if (reconciling) return;
  reconciling = true;
  try {
    const names = await orphanedRooms(new Set(sessionStore.all().map(s => s.roomCode)));
    const results = await Promise.allSettled(names.map(async name => { if (!await sessionStore.find(name)) await expireRoom(name); }));
    if (results.every(result => result.status === 'fulfilled')) app.locals.sessionRecoveryPending = false;
  } catch { /* Retry on the next sweep without logging credentials. */ }
  finally { reconciling = false; }
};
void reconcileOrphans();
setInterval(() => void reconcileOrphans(), 30_000).unref();
