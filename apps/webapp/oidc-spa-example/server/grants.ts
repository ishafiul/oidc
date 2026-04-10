const readGrants = new Map<string, Set<string>>();

export function grantRead(docId: string, granteeSub: string): void {
  let set = readGrants.get(docId);
  if (!set) {
    set = new Set();
    readGrants.set(docId, set);
  }
  set.add(granteeSub);
}

export function canReadDocument(params: {
  docId: string;
  sub: string;
  scopes: Set<string>;
  readScope: string;
}): boolean {
  if (params.scopes.has(params.readScope)) {
    return true;
  }
  return readGrants.get(params.docId)?.has(params.sub) ?? false;
}

export function listGrantees(docId: string): string[] {
  return [...(readGrants.get(docId) ?? [])];
}
