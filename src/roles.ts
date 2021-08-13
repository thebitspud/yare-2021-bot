import * as Turn from "./turn";

export function updateRole(s: Spirit, i: number): void {
	const energyRatio = s.energy / s.energy_capacity;

	if (Turn.isAttacking) {
		if (
			(s.mark === "defend" && memory.strategy === "all-in") ||
			i >= Turn.myUnits.length - Turn.idealDefenders
		) {
			return s.set_mark("defend");
		} else return s.set_mark("attack");
	} else if (energyRatio === 0.0) return s.set_mark("harvest");
	else if (energyRatio === 1.0) {
		if (i >= Turn.myUnits.length - Turn.idealDefenders) return s.set_mark("defend");
		else if (
			i < Turn.idealScouts &&
			(outpost.energy + Turn.outpostEnemyPower < (Turn.idealScouts * s.size) / 2 ||
				outpost.control === this_player_id)
		)
			return s.set_mark("scout");
		else return s.set_mark("deposit");
	}
}
