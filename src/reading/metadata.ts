import { decode } from "@shelacek/ubjson";
import { getRef, readRef, getLenRef } from "./browserReading";
import type { MetadataType } from "../types";
import type { SlpRefType, SlpReadInput } from "./browserReading";

// This function gets the position where the raw data starts
function getRawDataPosition(ref: SlpRefType): number {
  const buffer = readRef(ref, 1, 0);

  if (buffer[0] !== "{".charCodeAt(0)) {
    return 0; // return error?
  }

  return 15;
}

function getRawDataLength(ref: SlpRefType, position: number): number {
  const fileSize = getLenRef(ref);
  if (position === 0) {
    return fileSize;
  }

  const buffer = readRef(ref, 4, position - 4);

  const rawDataLen = (buffer[0]! << 24) | (buffer[1]! << 16) | (buffer[2]! << 8) | buffer[3]!;
  if (rawDataLen > 0) {
    // If this method manages to read a number, it's probably trustworthy
    return rawDataLen;
  }

  // If the above does not return a valid data length, return a file size
  // based on file length. This enables some support for severed files
  return fileSize - position;
}

export function getMetadata(input: SlpReadInput): MetadataType | null {
  const ref = getRef(input);
  const rawDataPosition = getRawDataPosition(ref);
  const rawDataLength = getRawDataLength(ref, rawDataPosition);
  const metadataPosition = rawDataPosition + rawDataLength + 10; // remove metadata string
  const metadataLength = getLenRef(ref) - metadataPosition - 1;

  if (metadataLength <= 0) {
    // This will happen on a severed incomplete file
    return null;
  }
  const buffer = readRef(ref, metadataLength, metadataPosition);

  try {
    const metadata = decode(buffer);
    return metadata;
  } catch (ex) {
    return null;
  }
}
