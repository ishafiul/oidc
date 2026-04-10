import { RelationTupleData } from '../storage/interfaces';

export function isExpired(tuple: RelationTupleData, now?: number): boolean {
	if (!tuple.expires_at) return false;
	return tuple.expires_at <= (now ?? Date.now());
}

