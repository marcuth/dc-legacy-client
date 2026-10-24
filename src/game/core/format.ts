/**
 * Port of the Flash client's number formatter (Utils): thousands separated by commas, and from
 * seven digits on a "+ N M" form with the fraction trimmed the way the original trims it.
 */
export const formatAmount = (value: number): string => {
  const digits = String(value)

  if (digits.length >= 7) {
    let millions: string
    if (value % 1_000_000 === 0) {
      millions = String(Math.trunc(value / 1_000_000))
    } else {
      millions = (value / 1_000_000).toFixed(3)
      const dot = millions.indexOf(".")
      const zero = dot === -1 ? -1 : millions.indexOf("0", dot)
      if (zero !== -1) millions = dot === zero - 1 ? millions.slice(0, dot) : millions.slice(0, zero)
    }
    return value > 0 ? `+ ${millions} M` : `${millions} M`
  }

  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}
