import * as Utils from "./utils";
import * as Turn from "./turn";

export function useMerge(s: CircleSpirit) {
	const shouldMerge =
		s.mark === "attack" &&
		enemy_base.shape === "triangles" &&
		(Utils.dist(s, Turn.rallyPosition) < 50 || memory.strategy === "all-in");

	if (!shouldMerge) {
		if (s.size > 1 && s.energy < s.size) s.divide();
		return;
	}

	const mergeTargets = <CircleSpirit[]>(
		Turn.myUnits.filter(
			(t) =>
				t.size + s.size <= memory.settings.maxMergeSize &&
				t.mark === s.mark &&
				t != s &&
				Utils.inRange(s, t, memory.config.mergeRange)
		)
	);

	if (mergeTargets.length) {
		const target = Utils.nearest(s, mergeTargets);
		target.size += s.size;
		s.merge(target);
	}
}
