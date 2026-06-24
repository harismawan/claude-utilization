export const BRAND = '#FFDE15'
export const ACCENTS = ['#FFDE15', '#FF6B6B', '#1FAB6E', '#28A6E0', '#FF9F43', '#A05CFA', '#7B5CFA']
export const TINTS = [
  '#FFF6BF',
  '#FFE0E0',
  '#FFE0CC',
  '#FFD7F2',
  '#F5E0FF',
  '#E8DFFF',
  '#E5F5D7',
  '#DCEEFF',
  '#D7F5E5',
]
// Stable color per model id (hash → ACCENTS index).
export function colorForModel(model: string): string {
  let h = 0
  for (let i = 0; i < model.length; i++) h = (h * 31 + model.charCodeAt(i)) >>> 0
  return ACCENTS[h % ACCENTS.length]!
}
