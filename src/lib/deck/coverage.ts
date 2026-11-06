/** Regional catalogue eligibility is separate from technical launch admission. */
const provinces: Record<string, string> = {
  ON: "ontario", QC: "quebec", BC: "british columbia", AB: "alberta", SK: "saskatchewan", MB: "manitoba",
  NB: "new brunswick", NS: "nova scotia", PE: "prince edward island", NL: "newfoundland and labrador",
  YT: "yukon", NT: "northwest territories", NU: "nunavut",
};
const normalize = (value: string) => value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function providerCoversProvince(region: unknown, province: unknown): boolean {
  if (typeof region !== "string") return false;
  const coverage = normalize(region);
  if (["canada", "national", "nationwide"].includes(coverage)) return true;
  if (typeof province !== "string") return false;
  const code = province.trim().toUpperCase();
  const home = provinces[code] ?? normalize(province);
  if (!Object.values(provinces).includes(home)) return false;
  return coverage.split(/\s*[/,;|]\s*/).some(part => (provinces[part.toUpperCase()] ?? part) === home);
}
