import * as Utils from "./utils";
import * as Turn from "./turn";
import "./roles";

const canDefend =
	Turn.mySupply + 1 >= Turn.enemyScouts.length * memory.enemySize * Turn.enemyShapePower;
const enemiesArriving =
	Turn.enemyUnits.filter((e) => Utils.inRange(e, base, 900)).length >=
	Turn.enemyUnits.length / 2;
const enemyBasePower = Turn.myUnits
	.filter((s) => Utils.inRange(s, enemy_base, 300))
	.map((s) => s.energy * 2)
	.reduce((acc, n) => acc + n, 0);
const canWinGame =
	enemyBasePower >= enemy_base.energy + Turn.enemyBaseDefense * enemy_base.hp;

/** Attempts to select an optimal energize target for the given spirit */
export function useEnergize(s: Spirit): void {
	const nearestStar = Utils.nearest(s, Object.values(stars));
	const canHarvestNearest = Utils.inRange(s, nearestStar) && nearestStar.energy > 0;

	// If no energy, energize self if star nearby
	if (s.energy <= 0) {
		if (canHarvestNearest) energize(s, s, 2);
		return;
	}

	const enemyTargets = s.sight.enemies_beamable
		.map((id) => spirits[id])
		.filter((t) => Utils.energyRatio(t) >= 0);

	// Always attack enemies in range, using an algorithm optimized to maximize kill count
	if (enemyTargets.length) {
		const killable = enemyTargets.filter(
			(t) => t.energy < Math.min(s.size, s.energy) * 2
		);
		if (killable.length) return energize(s, Utils.highestEnergy(killable), -2);
		else return energize(s, Utils.lowestEnergy(enemyTargets), -2);
	}

	// Attack just enough to guarantee enemy base's energy goes below 0 on next tick
	if (Utils.inRange(s, enemy_base)) {
		const canEnergize = (Turn.refuelAtCenter && s !== Turn.nearestScout) || canWinGame;
		const notOverkill = enemy_base.energy + Turn.enemyBaseDefense >= 0;

		if (canEnergize && notOverkill) return energize(s, enemy_base, -2);
	}

	// Energize base if threatened by invaders
	if (Utils.inRange(s, base)) {
		const baseCannotTank = base.energy - Turn.invaders.supply * 2 <= 0;
		if (baseCannotTank && !Turn.enemyAllIn) {
			return energize(s, base, 1);
		}
	}

	const energyRatio = Utils.energyRatio(s);

	// Need to retain some energy on spirit for combat efficiency
	if (Utils.inRange(s, outpost)) {
		if (Turn.isAttacking) {
			const starHasEnergy = memory.centerStar.energy > Turn.myCapacity - Turn.myEnergy;
			const nearEmpower = outpost.energy > 450 && outpost.energy < 550;
			const shouldEnergize =
				(memory.centerStar.energy / 2 > outpost.energy || nearEmpower) &&
				Utils.inRange(s, memory.centerStar);
			const readyToEnergize = memory.strategy !== "all-in" && energyRatio > 0.5;

			// Energize outpost if attacking through center and conditions met
			if (starHasEnergy && shouldEnergize && readyToEnergize) {
				return energize(s, outpost, Turn.enemyOutpost ? -2 : 1);
			}
		} else {
			// Energize outpost if low or controlled by enemy
			const outpostLow = outpost.energy < Math.max(25, Turn.outpostEnemyPower);
			if (Turn.enemyOutpost || (outpostLow && energyRatio > 0.5)) {
				return energize(s, outpost, Turn.enemyOutpost ? -2 : 1);
			}
		}
	}

	const allyTargets = s.sight.friends_beamable
		.map((id) => spirits[id])
		.filter((t) => Utils.energyRatio(t) < 1);

	const workerRoles: MarkState[] = ["haul", "relay"];
	const combatRoles: MarkState[] = ["scout", "defend", "attack"];

	// Allies that could benefit from an equalizing energy transfer
	let lowAllies = allyTargets.filter((t) => {
		const transferEnergy = (s.energy - s.size) / s.energy_capacity;
		const allyTransferEnergy = (t.energy + s.size) / t.energy_capacity;
		return allyTransferEnergy <= transferEnergy;
	});

	if (canHarvestNearest && !workerRoles.includes(s.mark)) {
		// Non-worker units at stars can also boost up allies of equal health
		lowAllies = allyTargets.filter(
			(t) => !Utils.inRange(t, nearestStar) && Utils.energyRatio(t) <= energyRatio
		);
	}

	if (allyTargets.length) {
		// Energize allies in danger if not against squares
		// Squares one-shot and overkill, so preemptive defensive energizing is a waste
		if (!Turn.vsSquares) {
			const inDanger = allyTargets.filter((t) => t.sight.enemies_beamable.length);
			if (inDanger.length) return energize(s, Utils.lowestEnergy(inDanger), 1);
		}

		// Energize allies of higher priority
		// In general, priority goes as follows:
		// combat units > idle/refueling units > worker units
		if (!combatRoles.includes(s.mark) && !Turn.enemyAllIn) {
			const combatAllies = allyTargets.filter((t) => combatRoles.includes(t.mark));

			if (combatAllies.length) {
				return energize(s, Utils.lowestEnergy(combatAllies), 1);
			} else if (workerRoles.includes(s.mark)) {
				const nonWorkers = allyTargets.filter((t) => !workerRoles.includes(t.mark));
				if (nonWorkers.length) return energize(s, Utils.lowestEnergy(nonWorkers), 1);
			}
		}
	}

	// If no higher priority actions and is worker unit in range, energize base
	if (Utils.inRange(s, base) && workerRoles.includes(s.mark)) {
		const atSpawnCutoff = base.energy >= base.current_spirit_cost || base.energy === 0;
		const stopSpawning = Turn.enemyAllIn && atSpawnCutoff && canDefend && enemiesArriving;
		// Stop energizing after a spawn cutoff if forced to defend
		if (!stopSpawning) return energize(s, base, 1);
	}

	if (allyTargets.length) {
		// Haulers should energize relays when possible
		if (s.mark === "haul") {
			const relays = allyTargets.filter((t) => t.mark === "relay");
			if (relays.length) return energize(s, Utils.lowestEnergy(relays), 1);
		}

		// Energize allies of similar priority with lower energy
		// Workers should not energize each other unless a prior condition is met
		if (lowAllies.length) {
			if (combatRoles.includes(s.mark)) {
				const combatAllies = lowAllies.filter((t) => combatRoles.includes(t.mark));
				if (combatAllies.length) return energize(s, Utils.lowestEnergy(combatAllies), 1);
			} else if (!workerRoles.includes(s.mark)) {
				const nonWorkers = lowAllies.filter((t) => !workerRoles.includes(t.mark));
				if (nonWorkers.length) return energize(s, Utils.lowestEnergy(nonWorkers), 1);
			}
		}
	}

	// If no other energize actions available, harvest from star and energize self
	if (canHarvestNearest && energyRatio < 1) {
		return energize(s, s, 2);
	}
}

/** Energizes the selected target and updates energy values accordingly
 * <br>adjustFactor: 2 for self, 1 for ally unit/structure, -2 for enemy unit/structure
 */
// TODO: automate adjustFactor
function energize(s: Spirit, target: Entity, adjustFactor: number) {
	s.energize(target);
	s.energy -= s.size;
	target.energy += s.size * adjustFactor;
}
