import { settings } from "./init";
import * as Utils from "./utils";
import * as Turn from "./turn";

export function useMerge(s: CircleSpirit) {
	const mustMerge = Turn.mustMerge.includes(s);
	const shouldMerge =
		enemy_base.shape === "triangles" && (s.mark === "attack" || mustMerge);

	if (!shouldMerge) {
		if (s.size > 1) s.divide();
		return;
	}

	const targetSpiritSize = mustMerge ? settings.maxMergeSize : settings.idealMergeSize;
	const mergeTargets = <CircleSpirit[]>Turn.myUnits.filter((t) => {
		return (
			t.size + s.size <= targetSpiritSize &&
			t.size > 0 &&
			t.mark === s.mark &&
			t != s &&
			Utils.inRange(s, t, memory.config.mergeRange)
		);
	});

	if (mergeTargets.length) {
		const target = Utils.nearest(s, mergeTargets);
		target.size += s.size;
		s.size = 0;
		s.merge(target);
	}
}
