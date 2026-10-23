export function createLocalAccountIssuer(providerId: string): string {
  return `local:${providerId}`;
}
