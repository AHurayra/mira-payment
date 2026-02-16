export function money(n) {
  const num = Number(n || 0);
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
