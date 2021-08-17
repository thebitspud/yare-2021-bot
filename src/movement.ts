import * as Utils from "./utils";
import * as Turn from "./turn";
import * as Roles from "./roles";

const loci = memory.loci;

const invaders = [...Turn.invaders.near, ...Turn.invaders.med];

const defenderRally =
	invaders.length && Roles.register.defend.length
		? Utils.nextPosition(
				Utils.nearest(base, invaders),
				Utils.midpoint(Utils.midpoint(...Roles.register.defend), base)
		  )
		: Turn.idlePosition;

const scoutRally = Utils.nextPosition(
	outpost,
	Utils.midpoint(...Roles.register.scout),
	402
);

const scoutPower = Roles.register.scout
	.slice(1) // first scout does its own thing
	.map((s) => s.energy)
	.reduce((acc, n) => acc + n, 0);

const enemyBasePower = enemy_base.sight.friends
	.map((id) => spirits[id].energy)
	.reduce((acc, n) => acc + n, 0);

// Positive if ally units are stronger, negative if enemy stronger
let outpostDisparity = scoutPower - Turn.outpostEnemyPower;
if (Turn.enemyOutpost) outpostDisparity -= Math.max(outpost.energy, 20);
else if (Turn.allyOutpost) outpostDisparity += Math.max(outpost.energy, 20);

const debug = memory.settings.debug;

/** Moves all units based on current role and turn state */
export function findMove(s: Spirit): void {
	const energyRatio = Utils.energyRatio(s);

	const nearbyEnemies = s.sight.enemies
		.map((id) => spirits[id])
		.filter((t) => t.energy > 0 && Utils.dist(t, s) <= 240);

	const dangerRating =
		nearbyEnemies.map((t) => t.energy).reduce((acc, n) => acc + n, 0) *
		Turn.enemyShapePower;

	const groupPower = s.sight.friends_beamable
		.filter((id) => Utils.dist(spirits[id], s) <= 20)
		.map((id) => spirits[id].energy)
		.reduce((acc, n) => acc + n, s.energy);

	// I am the enemy of my enemy
	// Not filtering out <0 energy units because cannot predict enemy energy transfers
	const explodeThreats = s.sight.enemies_beamable
		.map((id) => spirits[id])
		.filter((t) => t.sight.enemies_beamable.length >= 4);

	const avoidExplosives = s.energy <= explodeThreats.length * memory.config.explodeDamage;

	// If cannot win fight or versus explosive units, move away from threats
	if (Turn.triEnemy && explodeThreats.length && avoidExplosives) {
		// Computing an optimal escape vector
		const escapeVec = Utils.midpoint(
			...explodeThreats.map((t) => Utils.normalize(Utils.vectorTo(t, s)))
		);

		if (debug) s.shout("avoid");
		return s.move(Utils.add(s, Utils.normalize(escapeVec, 21)));
	} else if (groupPower < dangerRating) {
		// Computing escape vector that takes into account available enemy energy
		const enemyPowerVec = Utils.midpoint(
			...nearbyEnemies.map((t) => Utils.normalize(Utils.vectorTo(t, s), t.energy))
		);

		if (debug) s.shout("avoid");
		return s.move(Utils.add(s, Utils.normalize(enemyPowerVec, 21)));
	} else if (dangerRating && energyRatio > 0) {
		const enemyTargets = s.sight.enemies_beamable
			.map((t) => spirits[t])
			.filter((t) => Utils.energyRatio(t) >= 0);

		// Attack and chase vulnerable enemy units in range if stronger
		if (debug) s.shout("chase");
		if (enemyTargets.length)
			return safeMove(s, Utils.lowestEnergy(enemyTargets).position);
	}

	// Role specific movement commands
	switch (s.mark) {
		case "attack":
			if (memory.strategy === "all-in") {
				// If all-in, move towards enemy base
				return safeMove(s, Utils.nextPosition(enemy_base, s));
			} else if (energyRatio < 1 && Turn.rallyStar.energy > 0) {
				// Prepare by filling up on energy at star if possible
				const bestStar =
					Utils.inRange(s, memory.centerStar, 500) &&
					(!Turn.enemyOutpost || outpost.energy < 300)
						? memory.centerStar
						: Turn.rallyStar;

				return safeMove(s, Utils.nextPosition(bestStar, Turn.rallyPosition));
			} else {
				// Otherwise, just wait at attacker rally position
				return safeMove(s, Turn.rallyPosition);
			}
		case "defend":
			// Wait to intercept at the computed rally point (idle point if no nearby enemies)
			return safeMove(s, Utils.nextPosition(s, defenderRally, 21));
		case "scout":
			if (Turn.enemyOutpost || outpostDisparity < 0) {
				if (Roles.register.scout[0] === s || outpostDisparity < 0) {
					// Attempt to block enemy base production from back if cannot contest center
					const dist = groupPower > enemyBasePower + enemy_base.energy ? -198 : -398;
					return safeMove(s, Utils.nextPosition(enemy_base, memory.enemyStar, dist), 602);
				} else {
					if (groupPower * 0.7 >= scoutPower) {
						// Retake the outpost once scouts are grouped and ready
						return s.move(Utils.nextPosition(outpost, s));
					} else {
						// Otherwise rally and wait until grouped to attack
						return safeMove(s, Utils.nextPosition(outpost, scoutRally, 402));
					}
				}
			} else {
				const outpostLow = outpost.energy < Math.max(25, Turn.outpostEnemyPower);
				if (Turn.outpostEnemyPower > scoutPower) {
					// If need outpost to fight, retreat to center
					return s.move(loci.centerToOutpost);
				} else if (outpostLow && energyRatio > 0.5 && !Utils.inRange(s, outpost)) {
					// If outpost is low, move towards it to energize
					return s.move(Utils.nextPosition(outpost, s));
				} else {
					// If not threatened, harass enemy base and production
					if (groupPower > enemyBasePower) {
						// If no defenders or can overpower defenses, attack enemy base
						return s.move(Utils.nextPosition(enemy_base, outpost));
					} else {
						// Otherwise, attempt to block enemy production from within outpost range
						return s.move(Utils.nextPosition(enemy_base, outpost, 400));
					}
				}
			}
		case "relay":
			// Always move relays towards preset relay position
			return s.move(loci.baseToStar);
		case "haul":
			const relays = s.sight.friends_beamable
				.map((id) => spirits[id])
				.filter((t) => Utils.energyRatio(t) < 1 && t.mark === "relay");

			// Move to transfer energy from star to relays
			if (energyRatio >= 1 || (energyRatio > 0 && relays.length))
				return s.move(Utils.nextPosition(loci.baseToStar, memory.myStar));
			else return s.move(loci.starToBase);
		case "refuel":
			let starList = [memory.myStar];
			if (Turn.canHarvestCenter) starList.push(memory.centerStar);
			if (Utils.inRange(s, memory.enemyStar, 600)) starList.push(memory.enemyStar);

			// Move to refuel and reset at nearest safe star
			return safeMove(s, Utils.nextPosition(Utils.nearest(s, starList), s));
		case "idle":
		default:
			if (Turn.canHarvestCenter) {
				// Harvest energy from center if nothing better to do
				if (energyRatio >= 1 || (energyRatio > 0 && Utils.inRange(s, base)))
					return safeMove(s, loci.baseToCenter);
				else return safeMove(s, loci.centerToBase);
			} else {
				// Else just wait for an assignment at the default idle position
				return safeMove(s, Turn.idlePosition);
			}
	}
}

/**
 * Moves the specified unit towards a target while avoiding hostile outposts
 * @param s player unit to receive move command
 * @param target position or entity to move towards
 * @param range assumed outpost range
 */
function safeMove(s: Spirit, target: Position | Entity, range?: number) {
	if ("position" in target) target = target.position;
	// Just move normally if outpost is not hostile
	if (!Turn.enemyOutpost) return s.move(target);

	// Movement vector that spirit would follow normally and resulting position
	const unsafeNext = Utils.nextPosition(s, target, 21);

	// Size 20 vector from spirit to outpost used to calculate rotated vectors
	const toOutpost = Utils.normalize(Utils.vectorTo(s, outpost), 20);

	// Automatically use outer range if outpost is empowered or close to becoming empowered
	if (!range) range = outpost.energy > 400 ? 600 : 400;

	if (Utils.inRange(s, outpost, range)) {
		// Move out of outpost range if currently inside
		s.move(Utils.add(s, Utils.multiply(toOutpost, -1.5), Utils.vectorTo(s, unsafeNext)));
	} else if (Utils.inRange(unsafeNext, outpost, range + 1)) {
		// Movement vectors tangential to outpost range circle
		const cwTo = Utils.add(s, [-toOutpost[1], toOutpost[0]]);
		const ccwTo = Utils.add(s, [toOutpost[1], -toOutpost[0]]);
		const bestMove = Utils.dist(target, cwTo) < Utils.dist(target, ccwTo) ? cwTo : ccwTo;

		s.move(bestMove);
	} else s.move(target);
}
