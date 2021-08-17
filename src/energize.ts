import * as Utils from "./utils";
import * as Turn from "./turn";
import "./roles";

/** Attempts to select an optimal energize target for the given spirit */
export function useEnergize(s: Spirit): void {
	const nearestStar = Utils.nearest(s, Object.values(stars));

	// If no energy, energize self if star nearby
	if (s.energy === 0) {
		if (Utils.inRange(s, nearestStar) && nearestStar.energy > 0) {
			energize(s, s, 2);
		}
		return;
	}

	const enemyTargets = s.sight.enemies_beamable
		.map((id) => spirits[id])
		.filter((t) => Utils.energyRatio(t) >= 0);

	// Always attack enemies in range, prioritizing the lowest (positive) energy enemies first
	if (enemyTargets.length) {
		return energize(s, Utils.lowestEnergy(enemyTargets), -2);
	}

	// Attack just enough to guarantee enemy base's energy goes below 0 on next tick
	if (Utils.inRange(s, enemy_base)) {
		if (enemy_base.energy + Turn.enemyBaseSupply >= 0) {
			return energize(s, enemy_base, -2);
		}
	}

	// Energize base if threatened by invaders
	if (Utils.inRange(s, base) && base.energy - Turn.invaders.supply * 2 <= 0) {
		return energize(s, base, 1);
	}

	const energyRatio = Utils.energyRatio(s);

	// Need to retain some energy on spirit for combat efficiency
	if (Utils.inRange(s, outpost)) {
		if (Turn.isAttacking) {
			const starHasEnergy = memory.centerStar.energy > Turn.myCapacity - Turn.myEnergy;
			const nearEmpower = outpost.energy > 450 && outpost.energy < 550;
			const shouldEnergize =
				(memory.centerStar.energy > outpost.energy || nearEmpower) &&
				Turn.rallyStar === memory.centerStar;
			const readyToEnergize = memory.strategy !== "all-in" && energyRatio >= 0.5;

			// Energize outpost if attacking through center and conditions met
			if (starHasEnergy && shouldEnergize && readyToEnergize) {
				return energize(s, outpost, Turn.enemyOutpost ? -2 : 1);
			}
		} else {
			// Energize outpost if low or controlled by enemy
			const outpostLow = outpost.energy < Math.max(25, Turn.outpostEnemyPower);
			if (Turn.enemyOutpost || (outpostLow && energyRatio >= 0.5)) {
				return energize(s, outpost, Turn.enemyOutpost ? -2 : 1);
			}
		}
	}

	const allyTargets = s.sight.friends_beamable
		.map((id) => spirits[id])
		.filter((t) => Utils.energyRatio(t) < 1);

	const lowAllies = allyTargets.filter(
		(t) =>
			(t.energy + s.size) / t.energy_capacity <= (s.energy - s.size) / s.energy_capacity
	);

	const workerRoles: MarkState[] = ["haul", "relay"];
	const combatRoles: MarkState[] = ["scout", "defend", "attack"];

	if (allyTargets.length) {
		// Energize allies in danger if not against squares
		// Squares one-shot and overkill, so defensive energizing is a waste of energy
		if (!Turn.sqrEnemy) {
			const inDanger = allyTargets.filter((t) => t.sight.enemies_beamable.length);
			if (inDanger.length) return energize(s, Utils.lowestEnergy(inDanger), 1);
		}

		// Energize allies of higher priority
		// In general, priority goes as follows:
		// combat units > idle/refueling units > worker units
		if (!combatRoles.includes(s.mark)) {
			const combatAllies = allyTargets.filter((t) => combatRoles.includes(t.mark));

			if (combatAllies.length) {
				return energize(s, Utils.lowestEnergy(combatAllies), 1);
			} else if (workerRoles.includes(s.mark)) {
				const nonWorkers = allyTargets.filter((t) => !workerRoles.includes(t.mark));
				if (nonWorkers.length) return energize(s, Utils.lowestEnergy(nonWorkers), 1);
			}
		}

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

	// If no higher priority actions and is worker unit in range, energize base
	if (Utils.inRange(s, base) && workerRoles.includes(s.mark)) return energize(s, base, 1);

	// Handling edge case for haulers waiting for relays
	const relayInRange = !!allyTargets.filter((t) => t.mark === "relay").length;
	const noAvailableRelays = !lowAllies.filter((t) => t.mark === "relay").length;
	if (relayInRange && noAvailableRelays) {
		if (lowAllies.length) return energize(s, Utils.lowestEnergy(lowAllies), 1);
	}

	// If no other energize actions available, harvest from star and energize self
	if (Utils.inRange(s, nearestStar) && energyRatio < 1 && nearestStar.energy > 0) {
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
