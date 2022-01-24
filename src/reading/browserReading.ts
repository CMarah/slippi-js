export interface SlpReadInput {
  source: SlpInputSource;
  filePath?: string;
  buffer?: Uint8Array;
}
export enum SlpInputSource {
  BUFFER = "buffer",
  FILE = "file",
}

export interface SlpFileType {
  ref: SlpRefType;
  full_data: Uint8Array;
  rawDataPosition: number;
  rawDataLength: number;
  metadataPosition: number;
  metadataLength: number;
  messageSizes: {
    [command: number]: number;
  };
}

export interface SlpFileSourceRef {
  source: SlpInputSource;
  fileDescriptor: number;
}

export interface SlpBufferSourceRef {
  source: SlpInputSource;
  buffer: Uint8Array;
}

export interface SlpBufferSourceRef {
  source: SlpInputSource;
  buffer: Uint8Array;
}

export type SlpRefType = SlpFileSourceRef | SlpBufferSourceRef;

export const getRef = (input: SlpReadInput): SlpRefType => {
  switch (input.source) {
    case SlpInputSource.BUFFER:
      return {
        source: input.source,
        buffer: input.buffer,
      } as SlpBufferSourceRef;
    default:
      throw new Error("Source type not supported");
  }
};

export const readRef = (ref: SlpRefType, length: number, position: number): Uint8Array => {
  switch (ref.source) {
    case SlpInputSource.BUFFER:
      return (ref as SlpBufferSourceRef).buffer.slice(position, position + length);
    default:
      throw new Error("Source type not supported");
  }
};

export const getLenRef = (ref: SlpRefType): number => {
  switch (ref.source) {
    case SlpInputSource.BUFFER:
      return (ref as SlpBufferSourceRef).buffer.length;
    default:
      throw new Error("Source type not supported");
  }
};

export const readFullData = (input: SlpReadInput): Uint8Array => {
  const ref = getRef(input);
  switch (ref.source) {
    case SlpInputSource.BUFFER:
      return input.buffer || new Uint8Array();
    default:
      throw new Error("Source type not supported");
  }
};
