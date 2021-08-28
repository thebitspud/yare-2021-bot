import { settings } from "./init";
import * as Utils from "./utils";
import * as Turn from "./turn";
import * as Roles from "./roles";

const loci = memory.loci;
const register = Roles.register;

// Where defenders should group up at, based on current game state
let defenderRally = Utils.lerp(memory.myStar, memory.loci.baseToCenter, 0.6);
const defendMidpoint = Utils.midpoint(...register.defend);

const starSide =
	Utils.dist(Turn.targetEnemy, memory.myStar) < Utils.dist(Turn.targetEnemy, base);

if (Turn.enemyAllIn) {
	// If enemy is all-inning, group up near friendly structure
	defenderRally = Utils.nextPosition(
		starSide ? memory.myStar : base,
		Utils.lerp(defendMidpoint, Turn.targetEnemy, 0.2),
		starSide ? 150 : 100
	);
} else if (Turn.invaders.far.length) {
	const constraintNeeded =
		!Utils.inRange(Turn.targetEnemy, base, 400) &&
		!Utils.inRange(Turn.targetEnemy, memory.myStar, 400);
	if (Turn.vsSquares && constraintNeeded) {
		// Keep defenders within range of friendly structures vs squares
		defenderRally = Utils.nextPosition(
			starSide ? memory.myStar : base,
			Utils.lerp(defendMidpoint, Turn.targetEnemy),
			210
		);
	} else {
		// Move to intercept the target enemy
		defenderRally = Utils.nextPosition(
			Turn.targetEnemy,
			Utils.lerp(defendMidpoint, base)
		);
	}
}

const scoutPower = Turn.myUnits
	.filter((s) => ["attack", "scout"].includes(s.mark))
	.map((s) => s.energy)
	.reduce((acc, n) => acc + n, 0);

const enemyBasePower = enemy_base.sight.friends
	.map((id) => spirits[id].energy)
	.reduce((acc, n) => acc + n, 0);

// Positive if ally units are stronger, negative if enemy stronger
let outpostDisparity = scoutPower - Turn.outpostEnemyPower;
if (Turn.enemyOutpost) outpostDisparity -= Math.max(outpost.energy / 2, 20);
else if (Turn.allyOutpost) outpostDisparity += Math.max(outpost.energy / 2, 20);

// Units that have a chance of engaging the enemy next turn
const unitsInDanger = Turn.myUnits.filter((s) => {
	const nearbyEnemies = s.sight.enemies.map((id) => spirits[id]);
	if (!nearbyEnemies.length) return false;
	return Utils.inRange(s, Utils.nearest(s, nearbyEnemies), 240);
});

/** Moves all units based on current role and turn state */
export function findMove(s: Spirit): void {
	const energyRatio = Utils.energyRatio(s);

	const nearbyEnemies = s.sight.enemies
		.map((id) => spirits[id])
		.filter((t) => t.energy > 0 && Utils.inRange(s, t, 240));

	const dangerRating =
		nearbyEnemies
			.map((t) => {
				let distFactor = 1;
				if (Utils.inRange(t, base)) distFactor = Turn.enemyAllIn ? 0.25 : 0.5;
				else if (Utils.inRange(t, base, 400)) distFactor = Turn.enemyAllIn ? 0.5 : 1;
				return t.energy * distFactor;
			})
			.reduce((acc, n) => acc + n, 0) * Turn.enemyShapePower;

	const groupPower = unitsInDanger
		.filter((t) => Utils.inRange(s, t, 200))
		.map((t) => t.energy)
		.reduce((acc, n) => acc + n, 0);

	const allyPower = s.sight.friends_beamable
		.map((id) => spirits[id])
		.filter((t) => Utils.inRange(s, t, 50))
		.map((t) => t.energy)
		.reduce((acc, n) => acc + n, s.energy);

	// I am the enemy of my enemy
	// Not filtering out <0 energy units because cannot predict enemy energy transfers
	const explodeThreats = s.sight.enemies_beamable
		.map((id) => spirits[id])
		.filter((t) => t.sight.enemies_beamable.length >= 3);

	if (Turn.vsTriangles && explodeThreats.length) {
		// Always kite out of explode range vs triangles
		const escapeVec = Utils.midpoint(
			...explodeThreats.map((t) => Utils.normalize(Utils.vectorTo(t, s)))
		);

		if (settings.debug) s.shout("avoid");
		return s.move(Utils.add(s, Utils.normalize(escapeVec, 21)));
	} else if (dangerRating) {
		// Flee if enemies have a regional power advantage
		if (groupPower <= dangerRating) {
			const enemyPowerVec = Utils.midpoint(
				...nearbyEnemies.map((t) => Utils.normalize(Utils.vectorTo(t, s), t.energy))
			);

			if (settings.debug) s.shout("avoid");
			return s.move(Utils.add(s, Utils.normalize(enemyPowerVec, 21)));
		} else if (energyRatio > 0) {
			// Chase if allies have a regional power advantage
			const enemyTargets = s.sight.enemies_beamable
				.map((t) => spirits[t])
				.filter((t) => Utils.energyRatio(t) >= 0);

			// Chase towards vulnerable enemy units in range
			if (enemyTargets.length) {
				if (settings.debug) s.shout("chase");
				return safeMove(s, Utils.lowestEnergy(enemyTargets));
			}
		}
	}

	// Role specific movement commands
	switch (s.mark) {
		case "attack":
			if (memory.strategy === "rally" || Turn.doConverge) {
				// If rallying, move to attacker rally position
				return safeMove(s, Turn.rallyPosition);
			} else if (memory.strategy === "all-in") {
				// If all-in, move towards enemy base
				return safeMove(s, Utils.nextPosition(enemy_base, s));
			} else {
				// If retaking, move to outpost
				if (Utils.inRange(s, outpost)) return s.move(loci.centerToOutpost);
				else return s.move(Utils.nextPosition(outpost, s));
			}
		case "defend":
			// Wait to intercept at the computed defender rally point
			return safeMove(s, defenderRally);
		case "scout":
			if (Turn.enemyOutpost || outpostDisparity < 0 || Turn.blockerScout === s) {
				// Pressure enemy base from opposite direction of star
				if (allyPower > enemyBasePower + enemy_base.energy / 2) {
					// If can deal HP damage, attack enemy base
					return safeMove(s, Utils.nextPosition(enemy_base, s), 602);
				} else {
					// Otherwise, attempt to block enemy production
					return safeMove(s, loci.enemyBaseAntipode, 602);
				}
			} else {
				const outpostLow = outpost.energy < Math.max(25, Turn.outpostEnemyPower);
				const canFuelOutpost =
					outpostLow && energyRatio > 0.5 && !Utils.inRange(s, outpost);
				const contestOutpost = Turn.blockerScout !== s || outpost.energy === 0;
				if (Turn.outpostEnemyPower > scoutPower || Turn.enemyRetakePower) {
					// If need outpost to win fight, retreat to center
					return s.move(loci.centerToOutpost);
				} else if (canFuelOutpost && contestOutpost) {
					// If outpost is low, move towards it to energize
					return s.move(Utils.nextPosition(outpost, s, 100));
				} else {
					// If not threatened, harass enemy base and production
					if (allyPower > enemyBasePower) {
						// If can overpower defenses, attack enemy base
						return s.move(Utils.nextPosition(enemy_base, s));
					} else {
						// Otherwise, attempt to block enemy production from within outpost range
						return s.move(Utils.nextPosition(enemy_base, outpost, 400));
					}
				}
			}
		case "relay":
			// Always move relays towards preset relay position
			return safeMove(s, loci.baseToStar);
		case "haul":
			const relays = s.sight.friends_beamable.filter(
				(id) => spirits[id].mark === "relay"
			);

			const energizeRelay =
				energyRatio > 0 && relays.length && !Utils.inRange(s, memory.myStar);
			// Move to transfer energy from star to relays
			if ((Utils.inRange(s, base) || tick <= 3) && energyRatio >= 0.5) {
				return safeMove(s, loci.baseToStar);
			} else if (energyRatio >= 1 || energizeRelay) {
				return safeMove(s, Utils.nextPosition(loci.baseToStar, memory.myStar));
			} else return safeMove(s, loci.starToBase);
		case "refuel":
			let starList: Star[] = [Turn.rallyStar];
			if (Turn.refuelAtCenter) starList.push(memory.centerStar);
			if (Utils.inRange(s, memory.enemyStar, 600)) starList.push(memory.enemyStar);

			const bestStar = Utils.nearest(s, starList);
			let towards: Position | Entity;

			if (bestStar === memory.centerStar) {
				// Face away from outpost if hostile, and towards if friendly
				if (Turn.enemyOutpost) towards = loci.outpostAntipode;
				else if (memory.strategy === "all-in")
					if (Turn.doConverge) return s.move(Turn.rallyPosition);
					else towards = enemy_base;
				else if (Turn.enemyAllIn) towards = defenderRally;
				else if (memory.strategy === "rally") return s.move(Turn.rallyPosition);
				else towards = Utils.inRange(s, bestStar) ? loci.centerToOutpost : s;
			} else {
				if (Turn.enemyAllIn || memory.strategy === "economic") {
					// Face towards defender rally if not attacking
					towards = defenderRally;
				} else towards = Utils.inRange(s, bestStar) ? Turn.rallyPosition : s;
			}

			// Move to refuel and reset at nearest safe star
			return safeMove(s, Utils.nextPosition(bestStar, towards));
		case "idle":
		default:
			if (Turn.refuelAtCenter) {
				const harvestFrom = Turn.enemyOutpost ? loci.outpostAntipode : loci.centerToBase;
				// Harvest energy from center if able to and nothing better to do
				if (energyRatio > 0 && Utils.inRange(s, base)) {
					return safeMove(s, loci.baseToCenter);
				} else if (energyRatio < 1 && Utils.inRange(s, memory.centerStar)) {
					return safeMove(s, harvestFrom);
				} else {
					const bestNext = s.energy >= 5 ? loci.baseToCenter : harvestFrom;
					return safeMove(s, bestNext);
				}
			} else {
				// Else just wait for an assignment at the default idle position
				return safeMove(s, Utils.lerp(base, defenderRally, 0.7));
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
	// Just move normally if outpost is safe
	if (!Turn.enemyOutpost && (outpostDisparity >= 0 || Turn.enemyRetakePower < scoutPower))
		return s.move(target);

	// Movement vector that spirit would follow normally and resulting position
	const unsafeNext = Utils.nextPosition(s, target, 21);

	// Size 20 vector from spirit to outpost used to calculate rotated vectors
	const toOutpost = Utils.normalize(Utils.vectorTo(s, outpost), 21);

	// Automatically use outer range if outpost is empowered or close to becoming empowered
	if (!range) range = outpost.energy > 400 ? 600 : 400;

	if (Utils.inRange(s, outpost, range)) {
		// Move out of outpost range if currently inside
		const fromOutpost = Utils.multiply(toOutpost, -1.5);
		const adjustedTo = Utils.add(fromOutpost, Utils.vectorTo(s, unsafeNext));
		s.move(Utils.add(s, Utils.normalize(adjustedTo, 21)));
	} else if (Utils.inRange(unsafeNext, outpost, range + 1)) {
		// Movement vectors tangential to outpost range circle
		const cwTo = Utils.add(s, [-toOutpost[1], toOutpost[0]]);
		const ccwTo = Utils.add(s, [toOutpost[1], -toOutpost[0]]);
		const bestMove = Utils.dist(target, cwTo) < Utils.dist(target, ccwTo) ? cwTo : ccwTo;

		s.move(bestMove);
	} else s.move(target);
}
