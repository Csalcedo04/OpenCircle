import { z } from "zod";

/**
 * Money, the way the project invariants require it: an integer in the asset's minor unit,
 * always with the asset code and scale. `bigint` inside the server, a decimal string on the wire.
 */

export interface Asset {
  assetCode: string;
  assetScale: number;
}

export interface Money extends Asset {
  value: bigint;
}

/** `Money` as the API carries it: `value` is a decimal integer string. */
export interface AmountDto extends Asset {
  value: string;
}

export const toAmountDto = (m: Money): AmountDto => ({ value: m.value.toString(), assetCode: m.assetCode, assetScale: m.assetScale });

export const sameAsset = (a: Asset, b: Asset): boolean => a.assetCode === b.assetCode && a.assetScale === b.assetScale;

/** Integer minor units as a string (never a float); 18 digits stays within bigint. */
export const minorUnitsSchema = (min: "zero" | "positive") =>
  z
    .string()
    .regex(min === "zero" ? /^(0|[1-9]\d{0,17})$/ : /^[1-9]\d{0,17}$/, "Must be an integer amount in minor units")
    .transform((v) => BigInt(v));
