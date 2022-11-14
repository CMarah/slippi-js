import { flatten, get, groupBy, keyBy, mapValues } from "lodash";

import type { GameStartType } from "../types";
import type { ConversionType, InputCountsType, OverallType, RatioType } from "./common";
import type { PlayerInput } from "./inputs";

interface ConversionsByPlayerByOpening {
  [playerIndex: string]: {
    [openingType: string]: ConversionType[];
  };
}

export function generateOverallStats({
  settings,
  inputs,
  conversions,
  playableFrameCount,
}: {
  settings: GameStartType;
  inputs: PlayerInput[];
  conversions: ConversionType[];
  playableFrameCount: number;
}): OverallType[] {
  const inputsByPlayer = keyBy(inputs, "playerIndex");
  const originalConversions = conversions;
  const conversionsByPlayer = groupBy(conversions, (conv) => conv.moves[0]?.playerIndex);
  const conversionsByPlayerByOpening: ConversionsByPlayerByOpening = mapValues(conversionsByPlayer, (conversions) =>
    groupBy(conversions, "openingType"),
  );

  const gameMinutes = playableFrameCount / 3600;

  const overall = settings.players.map((player) => {
    const playerIndex = player.playerIndex;

    const playerInputs = get(inputsByPlayer, playerIndex) || {};
    const inputCounts: InputCountsType = {
      buttons: get(playerInputs, "buttonInputCount"),
      triggers: get(playerInputs, "triggerInputCount"),
      cstick: get(playerInputs, "cstickInputCount"),
      joystick: get(playerInputs, "joystickInputCount"),
      total: get(playerInputs, "inputCount"),
    };
    // const conversions = get(conversionsByPlayer, playerIndex) || [];
    // const successfulConversions = conversions.filter((conversion) => conversion.moves.length > 1);
    let conversionCount = 0;

    const opponentIndices = settings.players
      .filter((opp) => {
        // We want players which aren't ourselves
        if (opp.playerIndex === playerIndex) {
          return false;
        }

        // Make sure they're not on our team either
        return !settings.isTeams || opp.teamId !== player.teamId;
      })
      .map((opp) => opp.playerIndex);

    let totalDamage = 0;
    let killCount = 0;

    // These are the conversions that we did on our opponents
    originalConversions
      // Filter down to conversions of our opponent
      .filter((conversion) => conversion.playerIndex !== playerIndex)
      .forEach((conversion) => {
        conversionCount++;

        // We killed the opponent
        if (conversion.didKill && conversion.lastHitBy === playerIndex) {
          killCount += 1;
        }
        conversion.moves.forEach((move) => {
          if (move.playerIndex === playerIndex) {
            totalDamage += move.damage;
          }
        });
      });

    return {
      playerIndex: playerIndex,
      totalDamage: totalDamage,
      killCount: killCount,
      inputsPerMinute: getRatio(inputCounts.total, gameMinutes),
      openingsPerKill: getRatio(conversionCount, killCount),
      damagePerOpening: getRatio(totalDamage, conversionCount),
      neutralWinRatio: getOpeningRatio(conversionsByPlayerByOpening, playerIndex, opponentIndices, "neutral-win"),
    };
  });

  return overall;
}

function getRatio(count: number, total: number): RatioType {
  return {
    count: count,
    total: total,
    ratio: total ? count / total : null,
  };
}

function getOpeningRatio(
  conversionsByPlayerByOpening: ConversionsByPlayerByOpening,
  playerIndex: number,
  opponentIndices: number[],
  type: string,
): RatioType {
  const openings = get(conversionsByPlayerByOpening, [playerIndex, type]) || [];

  const opponentOpenings = flatten(
    opponentIndices.map((opponentIndex) => get(conversionsByPlayerByOpening, [opponentIndex, type]) || []),
  );

  return getRatio(openings.length, openings.length + opponentOpenings.length);
}
