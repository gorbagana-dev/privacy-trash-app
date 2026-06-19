export function formatAddress(address: string, visibleCharacters = 4) {
  if (address.length <= visibleCharacters * 2) {
    return address;
  }

  return `${address.slice(0, visibleCharacters)}...${address.slice(-visibleCharacters)}`;
}
