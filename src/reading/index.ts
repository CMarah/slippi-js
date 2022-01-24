export * from "./metadata";
export * from "./slpReader";

import { SlpInputSource } from "../reading/slpReader";
export const getInput = (input: string | ArrayBuffer | Uint8Array) => {
  if (typeof input === "string")
    return {
      source: SlpInputSource.FILE,
      filePath: input,
    };
  if (input instanceof ArrayBuffer)
    return {
      source: SlpInputSource.BUFFER,
      buffer: new Uint8Array(input),
    };
  if (input instanceof Uint8Array)
    return {
      source: SlpInputSource.BUFFER,
      buffer: input,
    };
  throw new Error("Cannot create SlippiGame with input of that type");
};
