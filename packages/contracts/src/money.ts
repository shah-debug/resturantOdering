export function formatRupees(paisa: number): string {
  const hasFraction = paisa % 100 !== 0;
  const amount = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paisa / 100);
  return `Rs ${amount}`;
}
