import { loadConfig } from './config.ts';
import { createApiServer } from './http.ts';
import { StateStore } from './state.ts';
import { SyncService } from './sync.ts';

const config = loadConfig();
const store = new StateStore(config.dataDir);
const sync = new SyncService(store, config);
const server = createApiServer({ config, store, sync });

server.listen(config.port, config.host, () => {
  const status = sync.status();
  console.log(`
Spendwise sync server
  Listening on   http://${config.host}:${config.port}   (only this computer can reach it)
  Data folder    ${config.dataDir}
  Allowed app    ${config.allowedOrigins.join(', ')}

  API token (paste it into the app once):
    ${store.get().apiToken}

  SimpleFIN      ${status.connected ? `connected, last sync ${status.lastSyncAt ?? 'never'}` : 'not connected yet'}
  Auto-sync      ${config.autoSync ? `every ${Math.round(config.syncEveryMs / 3_600_000)} h while this is running` : 'off'}
`);
  if (config.autoSync) sync.startScheduler();
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
