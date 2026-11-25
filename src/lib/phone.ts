/** 79852143308 → +7 985 214-33-08 */
export function formatRuPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 11) return raw
  return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
}

export const onlyDigits = (value: string) => value.replace(/\D/g, '')
