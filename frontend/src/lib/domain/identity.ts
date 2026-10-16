/** Identity documents the API accepts: cédula de ciudadanía, tarjeta de identidad, cédula de extranjería, passport. */
export const DOCUMENT_TYPES = ["cc", "ti", "ce", "pp"] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]
