import * as Cfg from "./config";

/** Returns the distance between two entities or positions */
export function dist(from: Position | Entity, to: Position | Entity): number {
	if ("position" in from) from = from.position;
	if ("position" in to) to = to.position;
	const xDist = from[0] - to[0];
	const yDist = from[1] - to[1];

	return Math.sqrt(xDist ** 2 + yDist ** 2);
}

/**
 * Normalizes a given vector to a specified length
 * @param vec position vector to normalize
 * @param mag (optional, default: 1) desired length (magnitude) of the output vector
 */
export function normalize(vec: Position, mag = 1): Position {
	const length = dist(vec, [0, 0]);
	return [(vec[0] * mag) / length, (vec[1] * mag) / length];
}

/** Adds all given position vectors together */
export function add(...entries: Position[]): Position {
	let output: Position = [0, 0];
	for (const vec of entries) output = [output[0] + vec[0], output[1] + vec[1]];
	return output;
}

/**
 * Returns the specified vector multiplied by a scalar
 * @param vec vector to multiply
 * @param factor scalar to multiply by
 */
export function multiply(vec: Position, factor: number): Position {
	return [vec[0] * factor, vec[1] * factor];
}

/** Returns the vector beginning at <start> and ending at <target> */
export function vectorTo(start: Position | Entity, target: Position | Entity): Position {
	if ("position" in start) start = start.position;
	if ("position" in target) target = target.position;
	return [target[0] - start[0], target[1] - start[1]];
}

/**
 * Returns true if the distance between two positions is below a certain value
 * @param from first entity or position
 * @param to second entity or position
 * @param range (optional, default: ENERGIZE_RANGE) max distance to return true
 */
export function inRange(
	from: Position | Entity,
	to: Position | Entity,
	range = Cfg.ENERGIZE_RANGE
): boolean {
	return dist(from, to) < range;
}

/** Returns the midpoint between 2 entities or positions */
export function midpoint(from: Position | Entity, to: Position | Entity): Position {
	if ("position" in from) from = from.position;
	if ("position" in to) to = to.position;
	return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
}

/**
 * Returns the position <range> units away from <tether> in the direction of <target>
 * (ie. the closest point to <target> on a <range> radius circle centered at <tether>)
 * @param tether position to start from
 * @param target position to move towards
 * @param range total distance to move
 */
export function nextPosition(
	tether: Position | Entity,
	target: Position | Entity,
	range = Cfg.ENERGIZE_RANGE
): Position {
	if ("position" in tether) tether = tether.position;
	if ("position" in target) target = target.position;
	return add(tether, normalize(vectorTo(tether, target), range - 1));
}

/**
 * Finds the entity closest to a given position from the specified list
 * @param from position to search from
 * @param list list of entities to choose from
 * CONSTRAINT: list cannot be empty
 */
export function nearest<T extends Entity>(from: Position | Entity, list: T[]): T {
	let nearestEntity = list[0];
	let nearestDist = -1;

	for (const entity of list) {
		const entityDist = dist(entity.position, from);
		if (nearestDist < 0 || entityDist < nearestDist) {
			nearestEntity = entity;
			nearestDist = entityDist;
		}
	}

	return nearestEntity;
}

/** Returns the energy the given star will generate on the next tick */
export function energyPerTick(star: Star): number {
	return Math.round(3 + star.energy / 100);
}
