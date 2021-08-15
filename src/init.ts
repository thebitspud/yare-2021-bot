import * as Utils from "./utils";

export const BOT_VERSION = "Yaresuo 2.0";

if (memory.init !== BOT_VERSION) {
	memory = {
		init: BOT_VERSION,
		settings: {
			attackSupply: 51,
			haulRelayRatio: 2.6,
			debug: true,
		},
		config: {
			energizeRange: 200,
			sightRange: 400,
			mergeRange: 10,
			explodeRange: 160,
			explodeDamage: 10,
		},
		strategy: "economic",
		allCenter: false,
		myStar: Utils.nearest(base, Object.values(stars)),
		enemyStar: Utils.nearest(enemy_base, Object.values(stars)),
		mySize: my_spirits[0].size,
		enemySize: Object.values(spirits).filter((s) => !my_spirits.includes(s))[0].size,
		centerStar: star_p89,
		loci: {},
	};

	memory.loci = {
		baseToStar: Utils.nextPosition(base, memory.myStar),
		baseToCenter: Utils.nextPosition(base, memory.centerStar),
		starToBase: Utils.nextPosition(memory.myStar, base),
		centerToBase: Utils.nextPosition(memory.centerStar, base),
		centerToOutpost: Utils.midpoint(memory.centerStar, outpost),
		outpostAntipode: Utils.add(
			Utils.vectorTo(outpost, memory.centerStar),
			memory.centerStar
		),
	};
}
