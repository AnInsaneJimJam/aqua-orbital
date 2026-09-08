import pg from 'pg';
import {parseNotification, type Invalidation, type NotificationSource} from './events.js';

export class PostgresNotifications implements NotificationSource {
  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private closed = false;
  private subscribers = new Set<{event: (event: Invalidation) => void; unavailable: () => void}>();
  private readonly clientFactory: () => pg.Client;
  private readonly delays: readonly number[];
  constructor(databaseUrl: string, clientFactory?: () => pg.Client, delays: readonly number[] = [250, 750]) {
    this.clientFactory = clientFactory ?? (() => new pg.Client({connectionString: databaseUrl, connectionTimeoutMillis: 2000, query_timeout: 2000, statement_timeout: 2000}));
    this.delays = delays.slice(0, 2);
  }
  async subscribe(onEvent: (event: Invalidation) => void, onUnavailable: () => void): Promise<() => void> {
    if (this.closed) throw Error('NOTIFICATIONS_UNAVAILABLE');
    if (!this.client) {
      this.connecting ??= this.connect().finally(() => { this.connecting = null; });
      await this.connecting;
    }
    if (this.closed || !this.client) throw Error('NOTIFICATIONS_UNAVAILABLE');
    const subscription = {event: onEvent, unavailable: onUnavailable};
    this.subscribers.add(subscription);
    return () => { this.subscribers.delete(subscription); };
  }
  private async connect() {
    for (let attempt = 0; attempt <= this.delays.length && !this.closed; attempt++) {
      const client = this.clientFactory();
      let failed = false;
      const unavailable = () => {
        failed = true;
        if (this.client !== client) return;
        this.client = null;
        // A gap cannot be replayed from NOTIFY. Close streams; reconnecting
        // clients receive a fresh full invalidation instead of a delivery claim.
        for (const subscriber of [...this.subscribers]) subscriber.unavailable();
        this.subscribers.clear();
        void client.end().catch(() => {});
      };
      client.on('error', unavailable);
      client.on('end', unavailable);
      client.on('notification', message => {
        if (message.channel !== 'orbital_blocks' || !message.payload) return;
        const event = parseNotification(message.payload);
        if (event) for (const subscriber of [...this.subscribers]) subscriber.event(event);
      });
      try {
        await client.connect();
        await client.query('LISTEN orbital_blocks');
        if (this.closed || failed) throw Error('NOTIFICATIONS_UNAVAILABLE');
        this.client = client;
        return;
      } catch {
        await client.end().catch(() => {});
        const delay = this.delays[attempt];
        if (!this.closed && delay !== undefined) await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw Error('NOTIFICATIONS_UNAVAILABLE');
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const subscriber of [...this.subscribers]) subscriber.unavailable();
    this.subscribers.clear();
    const client = this.client; this.client = null;
    if (client) await client.end().catch(() => {});
    await this.connecting?.catch(() => {});
  }
}
