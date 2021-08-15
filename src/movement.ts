import * as Utils from "./utils";
import * as Turn from "./turn";
import * as Roles from "./roles";

const loci = memory.loci;

const scoutRally = Utils.midpoint(...Roles.register.scout);
const scoutPower = Roles.register.scout
	.map((s) => s.energy)
	.reduce((acc, n) => n + acc, 0);

const closeInvaders = [...Turn.invaders.near, ...Turn.invaders.med];

const debug = memory.settings.debug;

/** Moves all units based on current role and turn state */
export function findMove(s: Spirit): void {
	const energyRatio = Utils.energyRatio(s);

	const nearbyEnemies = s.sight.enemies
		.map((id) => spirits[id])
		.filter((t) => t.energy > 0 && Utils.dist(t, s) <= 240);

	const dangerRating =
		nearbyEnemies.map((t) => t.energy).reduce((acc, n) => n + acc, 0) *
		Turn.enemyShapePower;

	const groupPower = s.sight.friends_beamable
		.filter((id) => Utils.dist(spirits[id], s) <= 20)
		.map((id) => spirits[id].energy)
		.reduce((acc, n) => n + acc, 0);

	// I am the enemy of my enemy
	// Not filtering out <0 energy units because cannot predict enemy energy transfers
	const explodeThreats = s.sight.enemies_beamable
		.map((id) => spirits[id])
		.filter((t) => t.sight.enemies_beamable.length >= 3);

	// If cannot win fight or versus explosive units, move away from threats
	if (
		Turn.triEnemy &&
		explodeThreats.length &&
		s.energy <= explodeThreats.length * memory.config.explodeDamage
	) {
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

		if (debug) s.shout("flee");
		return s.move(Utils.add(s, Utils.normalize(enemyPowerVec, 21)));
	} else if (dangerRating && energyRatio > 0) {
		const enemyTargets = s.sight.enemies_beamable
			.map((t) => spirits[t])
			.filter((t) => Utils.energyRatio(t) >= 0);

		// Attack and chase vulnerable enemy units in range if stronger
		if (debug) s.shout("chase");
		if (enemyTargets.length) return s.move(Utils.lowestEnergy(enemyTargets).position);
	}

	if (debug) s.shout(s.mark);
	// Role specific movement commands
	switch (s.mark) {
		case "attack":
			if (memory.strategy === "all-in") {
				// If all-in, move towards enemy base
				return safeMove(s, Utils.nextPosition(enemy_base, s));
			} else if (energyRatio < 1 && Turn.rallyStar.energy > 0) {
				// Prepare by filling up on energy at star if possible
				return safeMove(s, Utils.nextPosition(Turn.rallyStar, Turn.rallyPosition));
			} else {
				// Otherwise, just wait at attacker rally position
				return safeMove(s, Turn.rallyPosition);
			}
		case "defend":
			if (closeInvaders.length) {
				// Match positioning and prepare to intercept if invaders are present
				return safeMove(s, Utils.nextPosition(Utils.nearest(base, closeInvaders), base));
			} else {
				// Else wait at the standard idle point
				return safeMove(s, Turn.idlePosition);
			}
		case "scout":
			if (Turn.enemyOutpost) {
				const canRetake = scoutPower > Turn.outpostEnemyPower + outpost.energy;

				if (canRetake) {
					if (groupPower * 0.75 >= scoutPower) {
						// Retake the outpost once scouts are grouped and ready
						return s.move(Utils.nextPosition(outpost, s));
					} else {
						// Otherwise group up until ready and wait to attack
						return safeMove(s, Utils.nextPosition(outpost, scoutRally, 402));
					}
				} else {
					// Attempt to block enemy base from back if cannot contest outpost
					return safeMove(s, Utils.nextPosition(enemy_base, memory.enemyStar, -398));
				}
			} else {
				const outpostLow = outpost.energy < Math.max(25, Turn.outpostEnemyPower);
				if (outpostLow) {
					// If outpost is low and not owned by enemy, move towards it
					return s.move(Utils.nextPosition(outpost, s));
				} else if (Turn.outpostEnemyPower > scoutPower + outpost.energy) {
					// If cannot fight at all, get out of outpost range
					return s.move(Utils.nextPosition(outpost, s, 402));
				} else if (Turn.outpostEnemyPower > scoutPower) {
					// If need outpost to fight, retreat to center
					return s.move(loci.centerToOutpost);
				} else {
					// Attempt to block enemy base
					return s.move(Utils.nextPosition(enemy_base, outpost, 400));
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
		case "retreat":
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
 * @param spirit player unit to receive move command
 * @param target position or entity to move towards
 */
function safeMove(spirit: Spirit, target: Position | Entity) {
	if ("position" in target) target = target.position;
	// Just move normally if outpost is not hostile
	if (!Turn.enemyOutpost) return spirit.move(target);

	// Movement vector that spirit would follow normally and resulting position
	const unsafeNext = Utils.nextPosition(spirit, target, spirit.move_speed);

	// Use outer range if outpost is empowered or close to becoming empowered
	const range = outpost.energy > 400 ? 600 : 400;
	if (Utils.inRange(unsafeNext, outpost, range)) {
		// Size 21 vector from spirit to outpost used to calculate rotated vectors
		const toOutpost = Utils.normalize(Utils.vectorTo(spirit, outpost), 21);

		// Movement vectors tangential to outpost range circle
		const cwTo = Utils.add(spirit, [-toOutpost[1], toOutpost[0]]);
		const ccwTo = Utils.add(spirit, [toOutpost[1], -toOutpost[0]]);
		const bestMove = Utils.dist(target, cwTo) < Utils.dist(target, ccwTo) ? cwTo : ccwTo;

		spirit.move(bestMove);
	} else spirit.move(target);
}
