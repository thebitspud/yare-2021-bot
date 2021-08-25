/** Returns the distance between two entities or positions */
export function dist(from: Position | Entity, to: Position | Entity): number {
	if ("position" in from) from = from.position;
	if ("position" in to) to = to.position;
	return Math.sqrt((from[0] - to[0]) ** 2 + (from[1] - to[1]) ** 2);
}

/**
 * Normalizes a {vec} to the length of {mag}
 * @param vec position vector to normalize
 * @param mag (optional, default: 1) desired length (magnitude) of the output vector
 * <br>Setting {mag} to a negative number will reverse the input vector's direction
 */
export function normalize(vec: Position, mag = 1): Position {
	const length = dist(vec, [0, 0]);
	return [(vec[0] * mag) / length, (vec[1] * mag) / length];
}

/** Adds all given position vectors together */
export function add(...entries: (Position | Entity)[]): Position {
	let output: Position = [0, 0];

	for (let vec of entries) {
		if ("position" in vec) vec = vec.position;
		output = [output[0] + vec[0], output[1] + vec[1]];
	}

	return output;
}

/**
 * Returns the specified vector multiplied by a scalar
 * <br>For division, change factor to 1/x
 * @param vec vector to multiply
 * @param factor scalar to multiply by
 */
export function multiply(vec: Position, factor: number): Position {
	return [vec[0] * factor, vec[1] * factor];
}

/**
 * Returns the vector beginning at {start} and ending at {target}
 * <br>NOTE: If using for subtraction, output vector will be of form {target} - {start}
 */
export function vectorTo(start: Position | Entity, target: Position | Entity): Position {
	if ("position" in start) start = start.position;
	if ("position" in target) target = target.position;
	return [target[0] - start[0], target[1] - start[1]];
}

/**
 * Returns true if the distance between two positions is below {range}
 * @param from first entity or position
 * @param to second entity or position
 * @param range (optional, default: ENERGIZE_RANGE)
 */
export function inRange(
	from: Position | Entity,
	to: Position | Entity,
	range = memory.config.energizeRange
): boolean {
	return dist(from, to) < range;
}

/** Returns an interpolated point between the given positions, weighted according to {bias}
 * <br>{bias} > 0.5 returns a position closer to {to} than {from}
 * <br>{bias} < 0 returns a position before {from}
 * <br>{bias} > 1 returns a position past {to}
 */
export function lerp(
	from: Position | Entity,
	to: Position | Entity,
	bias = 0.5
): Position {
	if ("position" in from) from = from.position;
	if ("position" in to) to = to.position;
	return [from[0] * (1 - bias) + to[0] * bias, from[1] * (1 - bias) + to[1] * bias];
}

/** Returns the balancing point between all the given positions */
export function midpoint(...entries: (Position | Entity)[]): Position {
	if (!entries.length) return memory.centerStar.position;
	return multiply(add(...entries), 1 / entries.length);
}

/**
 * Returns the position {range} units away from {tether} in the direction of {target}
 * (ie. the closest point to {target} on a {range} radius circle centered at {tether})
 * @param tether position to start from
 * @param target position to move towards
 * @param range total distance to move
 */
export function nextPosition(
	tether: Position | Entity,
	target: Position | Entity,
	range = memory.config.energizeRange
): Position {
	if ("position" in tether) tether = tether.position;
	if ("position" in target) target = target.position;
	return add(tether, normalize(vectorTo(tether, target), range - 1));
}

/**
 * Finds the entity closest to a given position out of the specified list
 * <br>To find the farthest entity, see sister function {farthest()}
 * @param from position to search from
 * @param list list of entities to choose from
 * <br>CONSTRAINT: list cannot be empty
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

/**
 * Finds the entity farthest from a given position out of the specified list
 * <br>To find the nearest entity, see sister function {nearest()}
 * @param from position to search from
 * @param list list of entities to choose from
 * <br>CONSTRAINT: list cannot be empty
 */
export function farthest<T extends Entity>(from: Position | Entity, list: T[]): T {
	let farthestEntity = list[0];
	let farthestDist = -1;

	for (const entity of list) {
		const entityDist = dist(entity.position, from);
		if (entityDist > farthestDist) {
			farthestEntity = entity;
			farthestDist = entityDist;
		}
	}

	return farthestEntity;
}

/**
 * Returns the entity from the given list with the lowest energy
 * <br>To get the highest energy entity, see sister function {highestEnergy()}
 * <br>CONSTRAINT: list cannot be empty
 */
export function lowestEnergy<T extends Entity>(list: T[]): T {
	let lowest = list[0];
	for (const entity of list) {
		if (entity.energy < lowest.energy) lowest = entity;
	}
	return lowest;
}

/**
 * Returns the entity from the given list with the highest energy
 * <br>To get the lowest energy entity, see sister function {lowestEnergy()}
 * <br>CONSTRAINT: list cannot be empty
 */
export function highestEnergy<T extends Entity>(list: T[]): T {
	let lowest = list[0];
	for (const entity of list) {
		if (entity.energy < lowest.energy) lowest = entity;
	}
	return lowest;
}

/** Returns the energy the given star will generate on the next tick */
export function energyPerTick(star: Star): number {
	return Math.round(3 + star.energy / 100);
}

/** Returns the given entity's energy/capacity ratio */
export function energyRatio(entity: Entity): number {
	return entity.energy / entity.energy_capacity;
}
