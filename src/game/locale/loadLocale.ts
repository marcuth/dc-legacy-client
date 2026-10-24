import { fetchAssetText } from "../atlas/assetFiles"
import { Locale, parseStrings } from "./locale"

export type LocaleCode = "de" | "en" | "es" | "fr" | "it" | "pl" | "pt_br" | "tr"

export const loadLocale = async (code: LocaleCode = "en"): Promise<Locale> =>
    new Locale(parseStrings(await fetchAssetText(`Locale/locale_${code}.txt`)))
