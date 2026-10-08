export function normalizeSearchText(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("sq").trim();
}
export function matchesDescription(
  description: string,
  query: string,
): boolean {
  const text = normalizeSearchText(description);
  return normalizeSearchText(query)
    .split(/\s+/)
    .every((token) => {
      if (text.includes(token)) return true;
      // A small name-inflection aid: dinner can also find dinners. Not a general translator.
      const stem = token.length >= 4 ? token.replace(/[aë]$/, "") : token;
      return (
        stem !== token &&
        text.split(/\s+/).some((word) => word.startsWith(stem))
      );
    });
}
export function searchTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token.length >= 4 ? token.replace(/[aë]$/, "") : token));
}
