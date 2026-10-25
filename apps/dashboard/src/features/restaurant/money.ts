const RUPEE_INPUT = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

export function rupeesToPaisa(input: string): number | null {
  const match = RUPEE_INPUT.exec(input.trim().replace(/,/g, ''));
  if (!match) {
    return null;
  }
  const rupees = Number(match[1]);
  const paisa = Number((match[2] ?? '').padEnd(2, '0'));
  return rupees * 100 + paisa;
}

export function paisaToRupees(paisa: number): string {
  const rupees = Math.floor(paisa / 100);
  const remainder = paisa % 100;
  return remainder === 0 ? String(rupees) : `${rupees}.${String(remainder).padStart(2, '0')}`;
}

export function formatRupees(paisa: number): string {
  const hasFraction = paisa % 100 !== 0;
  const amount = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paisa / 100);
  return `Rs ${amount}`;
}
