import { convert } from "encoding-japanese";
import _ from "lodash";

import type { EventCallbackFunc, EventPayloadTypes, PlayerType, SelfInducedSpeedsType } from "../types";
import { Command } from "../types";
import { toHalfwidth } from "./fullwidth";
import { readFullData } from "./nodeReading";

export enum SlpInputSource {
  BUFFER = "buffer",
  FILE = "file",
}

export interface SlpReadInput {
  source: SlpInputSource;
  filePath?: string;
  buffer?: Uint8Array;
}

export type SlpRefType = SlpFileSourceRef | SlpBufferSourceRef;

export interface SlpFileType {
  full_data: Uint8Array;
  rawDataPosition: number;
  rawDataLength: number;
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

/**
 * Opens a file at path
 */
export function openSlpFile(input: SlpReadInput): SlpFileType {
  const full_data = readFullData(input);

  const raw_data_position = getRawDataPosition(full_data);
  const raw_data_length = getRawDataLength(full_data, raw_data_position);
  const message_sizes = getMessageSizes(full_data, raw_data_position);
  return {
    full_data: full_data,
    rawDataPosition: raw_data_position,
    rawDataLength: raw_data_length,
    messageSizes: message_sizes,
  };
}

// This function gets the position where the raw data starts
function getRawDataPosition(buffer: Uint8Array): number {
  if (buffer[0] !== "{".charCodeAt(0)) {
    return 0; // return error?
  }
  return 15;
}

function getRawDataLength(buffer: Uint8Array, position: number): number {
  const file_size = buffer.length;
  if (position === 0) {
    return file_size;
  }
  const length_info = buffer.slice(position - 4, position);
  const raw_data_len = (length_info[0]! << 24) | (length_info[1]! << 16) | (length_info[2]! << 8) | length_info[3]!;
  if (raw_data_len > 0) {
    // If this method manages to read a number, it's probably trustworthy
    return raw_data_len;
  }
  // If the above does not return a valid data length,
  // return a file size based on file length. This enables
  // some support for severed files
  return file_size - position;
}

function getMessageSizes(
  buffer: Uint8Array,
  position: number,
): {
  [command: number]: number;
} {
  const messageSizes: {
    [command: number]: number;
  } = {};
  // Support old file format
  if (position === 0) {
    messageSizes[0x36] = 0x140;
    messageSizes[0x37] = 0x6;
    messageSizes[0x38] = 0x46;
    messageSizes[0x39] = 0x1;
    return messageSizes;
  }

  const message_metadata = buffer.slice(position, position + 2);
  if (message_metadata[0] !== Command.MESSAGE_SIZES) {
    return {};
  }
  const payloadLength = message_metadata[1] as number;
  (messageSizes[0x35] as any) = payloadLength;

  const message_sizes_buffer = buffer.slice(position + 2, position + payloadLength + 1);
  for (let i = 0; i < payloadLength - 1; i += 3) {
    const command = message_sizes_buffer[i] as number;

    // Get size of command
    (messageSizes[command] as any) = (message_sizes_buffer[i + 1]! << 8) | message_sizes_buffer[i + 2]!;
  }

  return messageSizes;
}

/**
 * Iterates through slp events and parses payloads
 */
export function iterateEvents(
  slpFile: SlpFileType,
  getShouldStop: EventCallbackFunc,
  startPos: number | null = null,
): number {
  const full_data = slpFile.full_data;

  let readPosition = startPos !== null && startPos > 0 ? startPos : slpFile.rawDataPosition;
  const stopReadingAt = slpFile.rawDataPosition + slpFile.rawDataLength;

  while (readPosition < stopReadingAt) {
    const commandByte = full_data[readPosition] as number;
    const message_size = (slpFile.messageSizes[commandByte] as number) + 1;
    if (message_size === undefined) {
      // If we don't have an entry for this command, return false to indicate failed read
      return readPosition;
    }
    if (message_size > stopReadingAt - readPosition) {
      return readPosition;
    }

    const data = full_data.slice(readPosition, readPosition + message_size);
    const parsed_payload = parseMessage(commandByte, data);
    const shouldStop = getShouldStop(commandByte, parsed_payload);
    if (shouldStop) {
      break;
    }

    readPosition += message_size;
  }

  return readPosition;
}

const decodeBuf = (buf: Uint8Array): string | undefined =>
  convert(buf, {
    to: "UNICODE",
    from: "SJIS",
    type: "string",
  })
    .split("\0")
    .shift();

export function parseMessage(command: Command, payload: Uint8Array): EventPayloadTypes | null {
  const sliced_buffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
  const view = new DataView(sliced_buffer);
  switch (command) {
    case Command.GAME_START:
      const getPlayerObject = (playerIndex: number): PlayerType => {
        // Controller Fix stuff
        const cfOffset = playerIndex * 0x8;
        const dashback = readUint32(view, 0x141 + cfOffset);
        const shieldDrop = readUint32(view, 0x145 + cfOffset);
        let cfOption = "None";
        if (dashback !== shieldDrop) {
          cfOption = "Mixed";
        } else if (dashback === 1) {
          cfOption = "UCF";
        } else if (dashback === 2) {
          cfOption = "Dween";
        }

        // Nametag stuff
        const nametagLength = 0x10;
        const nametagOffset = playerIndex * nametagLength;
        const nametagStart = 0x161 + nametagOffset;
        const nametagBuf = payload.slice(nametagStart, nametagStart + nametagLength);
        const nameTagString = decodeBuf(nametagBuf);
        const nametag = nameTagString ? toHalfwidth(nameTagString) : "";

        // Display name
        const displayNameLength = 0x1f;
        const displayNameOffset = playerIndex * displayNameLength;
        const displayNameStart = 0x1a5 + displayNameOffset;
        const displayNameBuf = payload.slice(displayNameStart, displayNameStart + displayNameLength);
        const displayNameString = decodeBuf(displayNameBuf);
        const displayName = displayNameString ? toHalfwidth(displayNameString) : "";

        // Connect code
        const connectCodeLength = 0xa;
        const connectCodeOffset = playerIndex * connectCodeLength;
        const connectCodeStart = 0x221 + connectCodeOffset;
        const connectCodeBuf = payload.slice(connectCodeStart, connectCodeStart + connectCodeLength);
        const connectCodeString = decodeBuf(connectCodeBuf);
        const connectCode = connectCodeString ? toHalfwidth(connectCodeString) : "";

        const offset = playerIndex * 0x24;
        const result = {
          playerIndex: playerIndex,
          port: playerIndex + 1,
          characterId: readUint8(view, 0x65 + offset),
          characterColor: readUint8(view, 0x68 + offset),
          startStocks: readUint8(view, 0x67 + offset),
          type: readUint8(view, 0x66 + offset),
          teamId: readUint8(view, 0x6e + offset),
          controllerFix: cfOption,
          nametag: nametag,
          displayName: displayName,
          connectCode: connectCode,
        };
        return result;
      };
      return {
        slpVersion: `${readUint8(view, 0x1)}.${readUint8(view, 0x2)}.${readUint8(view, 0x3)}`,
        isTeams: readBool(view, 0xd),
        isPAL: readBool(view, 0x1a1),
        stageId: readUint16(view, 0x13),
        players: [0, 1, 2, 3].map(getPlayerObject),
        scene: readUint8(view, 0x1a3),
        gameMode: readUint8(view, 0x1a4),
      };
    case Command.PRE_FRAME_UPDATE:
      return {
        frame: readInt32(view, 0x1),
        playerIndex: readUint8(view, 0x5),
        isFollower: readBool(view, 0x6),
        seed: readUint32(view, 0x7),
        actionStateId: readUint16(view, 0xb),
        positionX: readFloat(view, 0xd),
        positionY: readFloat(view, 0x11),
        facingDirection: readFloat(view, 0x15),
        joystickX: readFloat(view, 0x19),
        joystickY: readFloat(view, 0x1d),
        cStickX: readFloat(view, 0x21),
        cStickY: readFloat(view, 0x25),
        trigger: readFloat(view, 0x29),
        buttons: readUint32(view, 0x2d),
        physicalButtons: readUint16(view, 0x31),
        physicalLTrigger: readFloat(view, 0x33),
        physicalRTrigger: readFloat(view, 0x37),
        percent: readFloat(view, 0x3c),
      };
    case Command.POST_FRAME_UPDATE:
      const selfInducedSpeeds: SelfInducedSpeedsType = {
        airX: readFloat(view, 0x35),
        y: readFloat(view, 0x39),
        attackX: readFloat(view, 0x3d),
        attackY: readFloat(view, 0x41),
        groundX: readFloat(view, 0x45),
      };
      return {
        frame: readInt32(view, 0x1),
        playerIndex: readUint8(view, 0x5),
        isFollower: readBool(view, 0x6),
        internalCharacterId: readUint8(view, 0x7),
        actionStateId: readUint16(view, 0x8),
        positionX: readFloat(view, 0xa),
        positionY: readFloat(view, 0xe),
        facingDirection: readFloat(view, 0x12),
        percent: readFloat(view, 0x16),
        shieldSize: readFloat(view, 0x1a),
        lastAttackLanded: readUint8(view, 0x1e),
        currentComboCount: readUint8(view, 0x1f),
        lastHitBy: readUint8(view, 0x20),
        stocksRemaining: readUint8(view, 0x21),
        actionStateCounter: readFloat(view, 0x22),
        miscActionState: readFloat(view, 0x2b),
        isAirborne: readBool(view, 0x2f),
        lastGroundId: readUint16(view, 0x30),
        jumpsRemaining: readUint8(view, 0x32),
        lCancelStatus: readUint8(view, 0x33),
        hurtboxCollisionState: readUint8(view, 0x34),
        selfInducedSpeeds: selfInducedSpeeds,
      };
    case Command.ITEM_UPDATE:
      return {
        frame: readInt32(view, 0x1),
        typeId: readUint16(view, 0x5),
        state: readUint8(view, 0x7),
        facingDirection: readFloat(view, 0x8),
        velocityX: readFloat(view, 0xc),
        velocityY: readFloat(view, 0x10),
        positionX: readFloat(view, 0x14),
        positionY: readFloat(view, 0x18),
        damageTaken: readUint16(view, 0x1c),
        expirationTimer: readFloat(view, 0x1e),
        spawnId: readUint32(view, 0x22),
        missileType: readUint8(view, 0x26),
        turnipFace: readUint8(view, 0x27),
        chargeShotLaunched: readUint8(view, 0x28),
        chargePower: readUint8(view, 0x29),
        owner: readInt8(view, 0x2a),
      };
    case Command.FRAME_BOOKEND:
      return {
        frame: readInt32(view, 0x1),
        latestFinalizedFrame: readInt32(view, 0x5),
      };
    case Command.GAME_END:
      return {
        gameEndMethod: readUint8(view, 0x1),
        lrasInitiatorIndex: readInt8(view, 0x2),
      };
    default:
      return null;
  }
}

function canReadFromView(view: DataView, offset: number, length: number): boolean {
  const viewLength = view.byteLength;
  return offset + length <= viewLength;
}

function readFloat(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 4)) {
    return null;
  }

  return view.getFloat32(offset);
}

function readInt32(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 4)) {
    return null;
  }

  return view.getInt32(offset);
}

function readInt8(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 1)) {
    return null;
  }

  return view.getInt8(offset);
}

function readUint32(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 4)) {
    return null;
  }

  return view.getUint32(offset);
}

function readUint16(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 2)) {
    return null;
  }

  return view.getUint16(offset);
}

function readUint8(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 1)) {
    return null;
  }

  return view.getUint8(offset);
}

function readBool(view: DataView, offset: number): boolean | null {
  if (!canReadFromView(view, offset, 1)) {
    return null;
  }

  return !!view.getUint8(offset);
}
