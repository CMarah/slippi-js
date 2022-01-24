/* eslint-disable @typescript-eslint/no-explicit-any */

declare module "enet" {
  import type { EventEmitter } from "events";

  export const PACKET_FLAG: any;
  export class Packet {
    public constructor(data: string | Uint8Array, flag: any);
    public data(): Uint8Array;
  }
  export interface Peer extends EventEmitter {
    ping(): void;
    disconnect(data?: any): void;
    send(channel: number, packet: Packet): boolean;
  }
  interface ClientArguments {
    peers: number;
    channels: number;
    down: number;
    up: number;
  }
  export interface Host extends Record<string, any> {
    connect(args: any, channels: number, data: any, callback: (err: Error, peer: Peer) => void): Peer;
    destroy(): void;
  }
  export function createClient(args: ClientArguments, callback: (err: Error, client: Host) => void): Host;
}

declare module "encoding-japanese" {
  function convert(buf: Uint8Array, opts: any): string;
  export default interface encoding {
    convert: Function;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
