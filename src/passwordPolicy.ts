export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

export const PASSWORD_REQUIREMENTS =
  'Da 12 a 200 caratteri stampabili. Sono ammessi caratteri Unicode e spazi interni, ma non spazi iniziali o finali.';

const unicodeWhitespace = /^\s$/u;
const unicodeNonPrintable = /[\p{C}\p{Z}]/u;

export function passwordPolicyError(password: string): string | null {
  const characters = Array.from(password);
  if (characters.length < MIN_PASSWORD_LENGTH) {
    return `La password deve contenere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
  }
  if (characters.length > MAX_PASSWORD_LENGTH) {
    return `La password non può superare ${MAX_PASSWORD_LENGTH} caratteri.`;
  }
  if (
    unicodeWhitespace.test(characters[0])
    || unicodeWhitespace.test(characters[characters.length - 1])
  ) {
    return 'La password non può iniziare o terminare con spazi bianchi.';
  }
  if (
    characters.some(
      (character) => character !== ' ' && unicodeNonPrintable.test(character),
    )
  ) {
    return 'La password può contenere solo caratteri stampabili.';
  }
  return null;
}
