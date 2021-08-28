import * as Utils from "./utils";
import * as Turn from "./turn";
import "./roles";

const canDefend =
	Turn.mySupply + (Turn.vsSquares ? 2 : 0) >=
	Turn.enemyScouts.length * memory.enemySize * Turn.enemyShapePower;
const enemiesArriving =
	Turn.enemyUnits.filter((e) => Utils.inRange(e, base, 900)).length >=
	Turn.enemyUnits.length / 2;
const winPower = Turn.myUnits
	.filter((s) => Utils.inRange(s, enemy_base, 300))
	.map((s) => s.energy)
	.reduce((acc, n) => acc + n, 0);
const outpostEnergizeThreat = Turn.enemyUnits
	.filter((s) => Utils.inRange(s, outpost))
	.map((s) => s.energy)
	.reduce((acc, n) => acc + n, 0);
const canWinGame =
	winPower * 2 >= enemy_base.energy + Turn.enemyBaseDefense * enemy_base.hp;

// When being all-inned by squares, assume they will always attack a target no matter what
if (Turn.enemyAllIn && enemy_base.shape === "squares") {
	for (const e of Turn.enemyUnits) {
		e.energy -= Math.min(e.size, e.energy);
	}
}

const combatEnemies = Turn.enemyUnits.filter((e) => e.sight.enemies_beamable.length);
// Accounting for enemy support energizing
for (const e of Turn.enemyUnits) {
	// Don't do calculation on combat units
	if (e.sight.enemies_beamable.length) continue;

	// Ignore if unit has no combat units in range
	const combatInRange = e.sight.friends_beamable
		.map((t) => spirits[t])
		.filter((t) => combatEnemies.includes(t));
	if (!combatInRange.length) continue;

	// Cannot predict energizes, so assume equal distribution of energy
	const power = Math.min(e.size, e.energy) / combatInRange.length;
	for (let t of combatInRange) t.energy += power;
}

/** Attempts to select an optimal energize target for the given spirit */
export function useEnergize(s: Spirit): void {
	const nearestStar = Utils.nearest(s, Object.values(stars));
	const canHarvestNearest = Utils.inRange(s, nearestStar) && nearestStar.energy > 0;

	// If no energy, energize self if star nearby
	if (s.energy <= 0) {
		if (canHarvestNearest) energize(s, nearestStar);
		return;
	}

	const enemyTargets = s.sight.enemies_beamable
		.map((id) => spirits[id])
		.filter((t) => Utils.energyRatio(t) >= 0);

	const energizePower = Math.min(s.size, s.energy);

	// Always attack enemies in range
	if (enemyTargets.length) {
		const killable = enemyTargets.filter((t) => t.energy < energizePower * 2);
		if (killable.length) return energize(s, Utils.highestEnergy(killable));
		else return energize(s, Utils.lowestEnergy(enemyTargets));
	}

	// Attack just enough to guarantee enemy base's energy goes below 0 on next tick
	if (Utils.inRange(s, enemy_base)) {
		const canEnergize =
			(Turn.refuelAtCenter && s !== Turn.blockerScout) ||
			canWinGame ||
			memory.strategy == "all-in";
		const notOverkill = enemy_base.energy + Turn.enemyBaseDefense >= 0;

		if (canEnergize && notOverkill) return energize(s, enemy_base);
	}

	// Energize base if threatened by invaders
	if (Utils.inRange(s, base)) {
		const baseCannotTank = base.energy - Turn.invaders.supply * 2 <= 0;
		if (baseCannotTank && !Turn.enemyAllIn) {
			return energize(s, base);
		}
	}

	const energyRatio = Utils.energyRatio(s);

	// Need to retain some energy on spirit for combat efficiency
	if (Utils.inRange(s, outpost)) {
		if (Turn.isAttacking) {
			// Always energize the outpost if hostile or low
			if (Turn.enemyOutpost) {
				if (outpost.energy > -outpostEnergizeThreat) {
					return energize(s, outpost);
				}
			} else {
				if (outpost.energy <= Math.min(10, outpostEnergizeThreat * 2))
					return energize(s, outpost);
			}

			const starHasEnergy = memory.centerStar.energy > Turn.myCapacity - Turn.myEnergy;
			const nearEmpower = outpost.energy > 400 && outpost.energy < 600;
			const shouldEnergize =
				(memory.centerStar.energy / 2 > outpost.energy || nearEmpower) &&
				Utils.inRange(s, memory.centerStar);
			const readyToEnergize =
				memory.strategy !== "all-in" && (energyRatio > 0.5 || outpost.energy <= 1);

			// Energize outpost if attacking through center and conditions met
			if (starHasEnergy && shouldEnergize && readyToEnergize) {
				return energize(s, outpost);
			}
		} else {
			const outpostLow = outpost.energy < Math.max(25, Turn.outpostEnemyPower);
			const enoughEnergy = (outpostLow && energyRatio > 0.5) || outpost.energy <= 1;
			if (Turn.enemyOutpost || enoughEnergy) {
				// Energize outpost if low or controlled by enemy
				return energize(s, outpost);
			}
		}
	}

	const allyTargets = s.sight.friends_beamable
		.map((id) => spirits[id])
		.filter((t) => Utils.energyRatio(t) < 1);

	let workerRoles: MarkState[] = ["haul", "relay"];
	if (Turn.refuelAtCenter) workerRoles.push("idle");

	let combatRoles: MarkState[] = ["scout", "attack", "defend"];
	if (Turn.enemyAllIn || memory.strategy === "rally") combatRoles.push("refuel");

	// Allies that could benefit from an equalizing energy transfer
	let lowAllies;

	// Checking if the nearest star is a valid refueling location
	let starList: Star[] = [Turn.rallyStar];
	if (Turn.refuelAtCenter) starList.push(memory.centerStar);
	if (Utils.inRange(s, memory.enemyStar, 600)) starList.push(memory.enemyStar);
	const bestStar = Utils.nearest(s, starList);

	if (bestStar === nearestStar && canHarvestNearest && !workerRoles.includes(s.mark)) {
		// Non-worker units at stars can boost up allies with less energy
		lowAllies = allyTargets.filter(
			(t) =>
				!Utils.inRange(t, nearestStar) &&
				Utils.energyRatio(t) <= energyRatio &&
				!workerRoles.includes(t.mark)
		);

		// Any non-worker unit energizing allies from star should have the refuel mark
		if (s.mark !== "refuel" && lowAllies.length) {
			s.set_mark("refuel");
		}
	} else {
		lowAllies = allyTargets.filter((t) => {
			const transferEnergy = (s.energy - energizePower) / s.energy_capacity;
			const allyTransferEnergy = (t.energy + energizePower) / t.energy_capacity;
			return allyTransferEnergy <= transferEnergy;
		});
	}

	if (lowAllies) {
	}

	if (allyTargets.length) {
		// Energize allies in danger if not against squares
		// Squares one-shot and overkill, so preemptive defensive energizing is a waste
		if (!Turn.vsSquares) {
			const inDanger = allyTargets.filter((t) => t.sight.enemies_beamable.length);
			if (inDanger.length) return energize(s, Utils.lowestEnergy(inDanger));
		}

		// Energize allies of higher priority
		// In general, priority goes as follows:
		// combat units > idle/refueling units > worker units
		if (!combatRoles.includes(s.mark) && !Turn.enemyAllIn) {
			const combatAllies = allyTargets.filter((t) => combatRoles.includes(t.mark));

			if (combatAllies.length) {
				return energize(s, Utils.lowestEnergy(combatAllies));
			} else if (workerRoles.includes(s.mark)) {
				const nonWorkers = allyTargets.filter((t) => !workerRoles.includes(t.mark));
				if (nonWorkers.length) return energize(s, Utils.lowestEnergy(nonWorkers));
			}
		}
	}

	// If no higher priority actions and is worker unit in range, energize base
	if (Utils.inRange(s, base) && workerRoles.includes(s.mark)) {
		const atSpawnCutoff = base.energy >= base.current_spirit_cost || base.energy === 0;
		const stopSpawning = Turn.enemyAllIn && atSpawnCutoff && canDefend && enemiesArriving;
		// Stop energizing after a spawn cutoff if forced to defend
		if (!stopSpawning) return energize(s, base);
	}

	if (allyTargets.length) {
		// Haulers should energize relays when possible
		if (s.mark === "haul") {
			const relays = allyTargets.filter((t) => t.mark === "relay");
			if (relays.length) return energize(s, Utils.lowestEnergy(relays));
		}

		// Energize allies of similar priority with lower energy
		if (lowAllies.length) {
			if (combatRoles.includes(s.mark)) {
				const combatAllies = lowAllies.filter((t) => combatRoles.includes(t.mark));
				if (combatAllies.length) return energize(s, Utils.lowestEnergy(combatAllies));
			} else if (!workerRoles.includes(s.mark)) {
				const nonWorkers = lowAllies.filter((t) => !workerRoles.includes(t.mark));
				if (nonWorkers.length) return energize(s, Utils.lowestEnergy(nonWorkers));
			}
		}
	}

	// If no other energize actions available, harvest from star and energize self
	if (canHarvestNearest && energyRatio < 1) {
		return energize(s, nearestStar);
	}
}

/** Energizes the selected target and updates energy values accordingly */
function energize(s: Spirit, target: Entity) {
	let energizePower = Math.min(s.size, s.energy);
	let transferRatio = 1;

	if ("player_id" in target) {
		// Setting {transferRatio} for units/bases according to allegiance
		transferRatio = (<Destructible>target).player_id === this_player_id ? 1 : -2;
	} else if ("structure_type" in target) {
		switch ((<Structure>target).structure_type) {
			case "outpost":
				// A neutral outpost is given the same {transferRatio} as a friendly one
				transferRatio = [this_player_id, ""].includes((<Outpost>target).control) ? 1 : -2;
				break;
			case "star":
				// {energizePower} works differently when attempting to refuel from a star
				target.energy -= Math.min(s.size, s.energy_capacity - s.energy);
				s.energy += s.size;
				s.energize(s);
				return;
		}
	}

	s.energize(target);
	s.energy -= energizePower;
	target.energy += energizePower * transferRatio;
}
