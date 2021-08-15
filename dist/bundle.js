(() => {
  // src/utils.ts
  function dist(from, to) {
    if ("position" in from)
      from = from.position;
    if ("position" in to)
      to = to.position;
    const xDist = from[0] - to[0];
    const yDist = from[1] - to[1];
    return Math.sqrt(xDist ** 2 + yDist ** 2);
  }
  function normalize(vec, mag = 1) {
    const length = dist(vec, [0, 0]);
    return [vec[0] * mag / length, vec[1] * mag / length];
  }
  function add(...entries) {
    let output = [0, 0];
    for (let vec of entries) {
      if ("position" in vec)
        vec = vec.position;
      output = [output[0] + vec[0], output[1] + vec[1]];
    }
    return output;
  }
  function multiply(vec, factor) {
    return [vec[0] * factor, vec[1] * factor];
  }
  function vectorTo(start2, target) {
    if ("position" in start2)
      start2 = start2.position;
    if ("position" in target)
      target = target.position;
    return [target[0] - start2[0], target[1] - start2[1]];
  }
  function inRange(from, to, range = memory.config.energizeRange) {
    return dist(from, to) < range;
  }
  function midpoint(...entries) {
    if (!entries.length)
      return memory.centerStar.position;
    return multiply(add(...entries), 1 / entries.length);
  }
  function nextPosition(tether, target, range = memory.config.energizeRange) {
    if ("position" in tether)
      tether = tether.position;
    if ("position" in target)
      target = target.position;
    return add(tether, normalize(vectorTo(tether, target), range - 1));
  }
  function nearest(from, list) {
    let nearestEntity = list[0];
    let nearestDist = -1;
    for (const entity of list) {
      const entityDist = dist(entity.position, from);
      if (nearestDist < 0 || entityDist < nearestDist) {
        nearestEntity = entity;
        nearestDist = entityDist;
      }
    }
    return nearestEntity;
  }
  function farthest(from, list) {
    let farthestEntity = list[0];
    let farthestDist = -1;
    for (const entity of list) {
      const entityDist = dist(entity.position, from);
      if (entityDist > farthestDist) {
        farthestEntity = entity;
        farthestDist = entityDist;
      }
    }
    return farthestEntity;
  }
  function lowestEnergy(list) {
    let lowest = list[0];
    for (const entity of list) {
      if (entity.energy < lowest.energy)
        lowest = entity;
    }
    return lowest;
  }
  function energyPerTick(star) {
    return Math.round(3 + star.energy / 100);
  }
  function energyRatio(entity) {
    return entity.energy / entity.energy_capacity;
  }

  // src/init.ts
  var BOT_VERSION = "Yaresuo 2.0";
  if (memory.init !== BOT_VERSION) {
    memory = {
      init: BOT_VERSION,
      settings: {
        attackSupply: 51,
        haulRelayRatio: 2.6,
        debug: true
      },
      config: {
        energizeRange: 200,
        sightRange: 400,
        mergeRange: 10,
        explodeRange: 160,
        explodeDamage: 10
      },
      strategy: "economic",
      allCenter: false,
      myStar: nearest(base, Object.values(stars)),
      enemyStar: nearest(enemy_base, Object.values(stars)),
      mySize: my_spirits[0].size,
      enemySize: Object.values(spirits).filter((s) => !my_spirits.includes(s))[0].size,
      centerStar: star_p89,
      loci: {}
    };
    memory.loci = {
      baseToStar: nextPosition(base, memory.myStar),
      baseToCenter: nextPosition(base, memory.centerStar),
      starToBase: nextPosition(memory.myStar, base),
      centerToBase: nextPosition(memory.centerStar, base),
      centerToOutpost: midpoint(memory.centerStar, outpost),
      outpostAntipode: add(vectorTo(outpost, memory.centerStar), memory.centerStar)
    };
  }

  // src/turn.ts
  var myUnits = my_spirits.filter((s) => s.hp > 0);
  var myEnergy = 0;
  var myCapacity = 0;
  var mySupply = 0;
  for (const s of myUnits) {
    if (!s.mark)
      s.mark = "idle";
    myEnergy += s.energy;
    myCapacity += s.energy_capacity;
    mySupply += s.size;
  }
  var allyOutpost = outpost.control === this_player_id;
  var enemyOutpost = outpost.control !== this_player_id && outpost.energy > 0;
  var enemyUnits = Object.values(spirits).filter((s) => s.hp > 0 && !myUnits.includes(s));
  var sqrEnemy = enemy_base.shape === "squares";
  var triEnemy = enemy_base.shape === "triangles";
  var enemyShapePower = sqrEnemy ? 0.6 : triEnemy ? 0.85 : 1;
  var invaders = {
    near: [],
    med: [],
    far: [],
    threat: 0,
    supply: 0
  };
  var outpostEnemyPower = 0;
  var enemyEnergy = 0;
  var enemyCapacity = 0;
  var enemyBaseSupply = 0;
  for (const e of enemyUnits) {
    const baseDist = dist(e, base);
    if (baseDist <= 800) {
      if (baseDist <= 600) {
        if (baseDist <= 400) {
          if (baseDist <= 200) {
            invaders.supply += Math.min(e.size, e.energy);
          }
          invaders.near.push(e);
        } else
          invaders.med.push(e);
      } else
        invaders.far.push(e);
      const baseDistFactor = 400 / (Math.max(baseDist, 300) - 140) - 0.5;
      invaders.threat += e.energy * baseDistFactor;
    }
    const outpostDist = dist(e, outpost);
    if (outpostDist <= 600) {
      const outpostDistFactor = (700 - Math.max(outpostDist, 200)) / 400;
      outpostEnemyPower += e.energy * outpostDistFactor;
    }
    if (inRange(e, enemy_base)) {
      enemyBaseSupply += Math.min(e.size, e.energy);
    }
    enemyEnergy += e.energy;
    enemyCapacity += e.energy_capacity;
  }
  var idealDefenders = Math.ceil(invaders.threat / (memory.mySize * 10));
  var idealScouts = Math.ceil(3 / memory.mySize) + Math.ceil(myUnits.length / 8);
  var maxWorkers = getMaxWorkers();
  function getMaxWorkers() {
    let energyRegenCap = energyPerTick(memory.myStar);
    if (memory.myStar.energy < 500)
      energyRegenCap--;
    else if (memory.myStar.energy > 900)
      energyRegenCap++;
    const workerEfficiency = 1 / (memory.settings.haulRelayRatio + 1);
    return Math.floor(energyRegenCap / workerEfficiency);
  }
  var isAttacking = ["rally", "all-in"].includes(memory.strategy);
  var canBeatBase = myEnergy * 2 > enemy_base.energy + enemyBaseSupply;
  var canBeatAll = myCapacity > enemy_base.energy + enemyCapacity * enemyShapePower * 2;
  var readyToAttack = mySupply >= memory.settings.attackSupply || canBeatAll;
  var canHarvestCenter = memory.centerStar.energy > 0 && allyOutpost;
  if (!isAttacking && readyToAttack && canBeatBase) {
    memory.strategy = "rally";
    const centerHasEnergy = memory.centerStar.energy >= myCapacity - myEnergy;
    memory.allCenter = canHarvestCenter && centerHasEnergy;
  }
  var rallyStar = memory.allCenter ? memory.centerStar : memory.myStar;
  var rallyPosition = memory.allCenter ? memory.loci.centerToOutpost : nextPosition(base, memory.loci.outpostAntipode);
  if (memory.strategy === "rally") {
    let groupedSupply = 0;
    for (const s of my_spirits) {
      if (dist(s, rallyPosition) <= 50) {
        groupedSupply += s.size;
      }
    }
    if (groupedSupply > (mySupply - idealDefenders) * 0.6) {
      memory.strategy = "all-in";
    }
  }
  var powerRatio = myEnergy / (enemyEnergy * enemyShapePower);
  if (memory.strategy === "all-in" && !canBeatBase && powerRatio < 1) {
    memory.strategy = "economic";
    memory.allCenter = false;
  }
  var idlePosition = enemyOutpost && outpost.energy > 450 ? memory.loci.baseToStar : nextPosition(memory.loci.baseToCenter, memory.myStar);
  function log() {
    console.log(`${this_player_id} // ${BOT_VERSION} // Turn ${tick}`);
    console.log(`Strategy:  ${memory.strategy} // Attacking: ${isAttacking}`);
    console.log(`${myUnits.length} ${base.shape} vs. ${enemyUnits.length} ${enemy_base.shape}`);
    const energyString = `Energy: ${myEnergy}/${myCapacity} vs. ${enemyEnergy}/${enemyCapacity}`;
    console.log(energyString + ` // Power Ratio: ${powerRatio.toFixed(2)}`);
    const invaderCountString = `[${invaders.near.length}/${invaders.med.length}/${invaders.far.length}]`;
    console.log(`Threat: ${invaders.threat.toFixed(2)} from ${invaderCountString} enemies`);
  }

  // src/roles.ts
  var register = {
    idle: [],
    haul: [],
    relay: [],
    attack: [],
    defend: [],
    scout: [],
    retreat: []
  };
  for (const role in register) {
    register[role] = myUnits.filter((s) => s.mark === role);
  }
  var workerRatio = memory.settings.haulRelayRatio;
  function setRole(s, role) {
    if (s.mark === role)
      return;
    const index = register[s.mark].indexOf(s);
    if (index != -1)
      register[s.mark].splice(index);
    s.set_mark(role);
    register[role].push(s);
  }
  function update() {
    removeExtras();
    assignRoles();
    optimizeWorkers();
  }
  function removeExtras() {
    const retreatable = ["defend", "attack", "scout", "idle"];
    for (const s of myUnits) {
      const energyRatio2 = energyRatio(s);
      if (energyRatio2 < 0.2 && retreatable.includes(s.mark)) {
        setRole(s, "retreat");
      }
      if (energyRatio2 >= 0.9 && s.mark === "retreat") {
        setRole(s, "idle");
      }
    }
    if (!isAttacking && register.attack.length > 0) {
      register.attack.forEach((s) => setRole(s, "idle"));
    }
    while (register.defend.length > Math.max(idealDefenders, 0)) {
      setRole(farthest(base, register.defend), "idle");
    }
    while (register.scout.length > Math.max(idealScouts, 0)) {
      setRole(nearest(base, register.scout), "idle");
    }
    while ([...register.haul, ...register.relay].length > Math.max(maxWorkers, 0)) {
      const removeHauler = register.haul.length > (register.relay.length - 1) * workerRatio;
      const list = removeHauler ? register.haul : register.relay;
      if (list.length > 0)
        setRole(nearest(memory.myStar, list), "idle");
      else
        break;
    }
  }
  function assignRoles() {
    if (isAttacking) {
      for (const s of myUnits) {
        if (s.mark !== "defend")
          setRole(s, "attack");
      }
    }
    while (register.defend.length < idealDefenders) {
      const validIdle = register.idle.filter((s) => energyRatio(s) >= 0.5);
      if (validIdle.length) {
        setRole(nearest(base, validIdle), "defend");
        continue;
      }
      const workers = [...register.haul, ...register.relay];
      const validWorkers = workers.filter((s) => energyRatio(s) > 0.5);
      if (validWorkers.length) {
        setRole(nearest(base, validWorkers), "defend");
        continue;
      }
      const validAttackers = register.attack.filter((s) => energyRatio(s) === 1 && dist(s, base) < 800 && s.size === 1);
      if (validAttackers.length) {
        setRole(nearest(base, validAttackers), "defend");
      } else
        break;
    }
    if (isAttacking)
      return;
    while (register.scout.length + register.retreat.length < idealScouts) {
      if (register.idle.length) {
        setRole(nearest(memory.centerStar, register.idle), "scout");
      } else
        break;
    }
    while (register.relay.length + register.haul.length < maxWorkers) {
      const addHauler = register.haul.length + 1 <= register.relay.length * workerRatio;
      const bestRole = addHauler ? "haul" : "relay";
      const bestLocation = bestRole === "haul" ? memory.myStar : base;
      if (register.idle.length) {
        setRole(nearest(bestLocation, register.idle), bestRole);
      } else
        break;
    }
  }
  function optimizeWorkers() {
    while (register.haul.length + 1 <= (register.relay.length - 1) * workerRatio) {
      if (!register.relay.length)
        break;
      setRole(nearest(memory.myStar, register.relay), "haul");
    }
    while (register.haul.length - 1 > (register.relay.length + 1) * workerRatio) {
      if (!register.haul.length)
        break;
      setRole(nearest(memory.loci.baseToStar, register.haul), "relay");
    }
  }
  function log2() {
    const defendString = `Defenders: ${register.defend.length}/${idealDefenders}`;
    const scoutString = `Scouts: ${register.scout.length}/${idealScouts}`;
    const workerCount = register.haul.length + register.relay.length;
    const workerString = `Workers: ${workerCount}/${maxWorkers}`;
    console.log(defendString + " // " + scoutString);
    console.log(workerString + ` // Attackers: ${register.attack.length}`);
    console.log(`Retreating: ${register.attack.length} // Idle: ${register.idle.length}`);
  }

  // src/movement.ts
  var loci = memory.loci;
  var scoutRally = midpoint(...register.scout);
  var scoutPower = register.scout.map((s) => s.energy).reduce((acc, n) => n + acc, 0);
  var closeInvaders = [...invaders.near, ...invaders.med];
  var debug = memory.settings.debug;
  function findMove(s) {
    const energyRatio2 = energyRatio(s);
    const nearbyEnemies = s.sight.enemies.map((id) => spirits[id]).filter((t) => t.energy > 0 && dist(t, s) <= 240);
    const dangerRating = nearbyEnemies.map((t) => t.energy).reduce((acc, n) => n + acc, 0) * enemyShapePower;
    const groupPower = s.sight.friends_beamable.filter((id) => dist(spirits[id], s) <= 20).map((id) => spirits[id].energy).reduce((acc, n) => n + acc, 0);
    const explodeThreats = s.sight.enemies_beamable.map((id) => spirits[id]).filter((t) => t.sight.enemies_beamable.length >= 3);
    if (triEnemy && explodeThreats.length && s.energy <= explodeThreats.length * memory.config.explodeDamage) {
      const escapeVec = midpoint(...explodeThreats.map((t) => normalize(vectorTo(t, s))));
      if (debug)
        s.shout("avoid");
      return s.move(add(s, normalize(escapeVec, 21)));
    } else if (groupPower < dangerRating) {
      const enemyPowerVec = midpoint(...nearbyEnemies.map((t) => normalize(vectorTo(t, s), t.energy)));
      if (debug)
        s.shout("flee");
      return s.move(add(s, normalize(enemyPowerVec, 21)));
    } else if (dangerRating && energyRatio2 > 0) {
      const enemyTargets = s.sight.enemies_beamable.map((t) => spirits[t]).filter((t) => energyRatio(t) >= 0);
      if (debug)
        s.shout("chase");
      if (enemyTargets.length)
        return s.move(lowestEnergy(enemyTargets).position);
    }
    if (debug)
      s.shout(s.mark);
    switch (s.mark) {
      case "attack":
        if (memory.strategy === "all-in") {
          return safeMove(s, nextPosition(enemy_base, s));
        } else if (energyRatio2 < 1 && rallyStar.energy > 0) {
          return safeMove(s, nextPosition(rallyStar, rallyPosition));
        } else {
          return safeMove(s, rallyPosition);
        }
      case "defend":
        if (closeInvaders.length) {
          return safeMove(s, nextPosition(nearest(base, closeInvaders), base));
        } else {
          return safeMove(s, idlePosition);
        }
      case "scout":
        if (enemyOutpost) {
          const canRetake = scoutPower > outpostEnemyPower + outpost.energy;
          if (canRetake) {
            if (groupPower * 0.75 >= scoutPower) {
              return s.move(nextPosition(outpost, s));
            } else {
              return safeMove(s, nextPosition(outpost, scoutRally, 402));
            }
          } else {
            return safeMove(s, nextPosition(enemy_base, memory.enemyStar, -398));
          }
        } else {
          const outpostLow = outpost.energy < Math.max(25, outpostEnemyPower);
          if (outpostLow) {
            return s.move(nextPosition(outpost, s));
          } else if (outpostEnemyPower > scoutPower + outpost.energy) {
            return s.move(nextPosition(outpost, s, 402));
          } else if (outpostEnemyPower > scoutPower) {
            return s.move(loci.centerToOutpost);
          } else {
            return s.move(nextPosition(enemy_base, outpost, 400));
          }
        }
      case "relay":
        return s.move(loci.baseToStar);
      case "haul":
        const relays = s.sight.friends_beamable.map((id) => spirits[id]).filter((t) => energyRatio(t) < 1 && t.mark === "relay");
        if (energyRatio2 >= 1 || energyRatio2 > 0 && relays.length)
          return s.move(nextPosition(loci.baseToStar, memory.myStar));
        else
          return s.move(loci.starToBase);
      case "retreat":
        let starList = [memory.myStar];
        if (canHarvestCenter)
          starList.push(memory.centerStar);
        if (inRange(s, memory.enemyStar, 600))
          starList.push(memory.enemyStar);
        return safeMove(s, nextPosition(nearest(s, starList), s));
      case "idle":
      default:
        if (canHarvestCenter) {
          if (energyRatio2 >= 1 || energyRatio2 > 0 && inRange(s, base))
            return safeMove(s, loci.baseToCenter);
          else
            return safeMove(s, loci.centerToBase);
        } else {
          return safeMove(s, idlePosition);
        }
    }
  }
  function safeMove(spirit, target) {
    if ("position" in target)
      target = target.position;
    if (!enemyOutpost)
      return spirit.move(target);
    const unsafeNext = nextPosition(spirit, target, spirit.move_speed);
    const range = outpost.energy > 400 ? 600 : 400;
    if (inRange(unsafeNext, outpost, range)) {
      const toOutpost = normalize(vectorTo(spirit, outpost), 21);
      const cwTo = add(spirit, [-toOutpost[1], toOutpost[0]]);
      const ccwTo = add(spirit, [toOutpost[1], -toOutpost[0]]);
      const bestMove = dist(target, cwTo) < dist(target, ccwTo) ? cwTo : ccwTo;
      spirit.move(bestMove);
    } else
      spirit.move(target);
  }

  // src/energize.ts
  function pickTarget(s) {
    const nearestStar = nearest(s, Object.values(stars));
    if (s.energy === 0) {
      if (inRange(s, nearestStar))
        energize(s, s, 2);
      return;
    }
    const enemyTargets = s.sight.enemies_beamable.map((id) => spirits[id]).filter((t) => energyRatio(t) >= 0);
    if (enemyTargets.length) {
      return energize(s, lowestEnergy(enemyTargets), -2);
    }
    if (inRange(s, enemy_base)) {
      if (enemy_base.energy + enemyBaseSupply >= 0) {
        return energize(s, enemy_base, -2);
      }
    }
    if (inRange(s, base) && base.energy - invaders.supply * 2 <= 0) {
      return energize(s, base, 1);
    }
    if (inRange(s, outpost) && energyRatio(s) >= 0.5) {
      if (isAttacking) {
        const vacantCapacity = myCapacity - myEnergy;
        const starHasEnergy = memory.centerStar.energy > vacantCapacity;
        const nearEmpower = outpost.energy > 450 && outpost.energy < 550;
        const shouldEnergize = memory.centerStar.energy > outpost.energy || nearEmpower;
        const readyToEnergize = memory.strategy !== "all-in";
        if (starHasEnergy && shouldEnergize && readyToEnergize) {
          return energize(s, outpost, enemyOutpost ? -2 : 1);
        }
      } else {
        const outpostLow = outpost.energy < Math.max(25, outpostEnemyPower);
        if (enemyOutpost || outpostLow) {
          return energize(s, outpost, enemyOutpost ? -2 : 1);
        }
      }
    }
    const allyTargets = s.sight.friends_beamable.map((id) => spirits[id]).filter((t) => energyRatio(t) < 1);
    const workerRoles = ["haul", "relay"];
    const combatRoles = ["scout", "defend", "attack"];
    if (allyTargets.length) {
      if (!sqrEnemy) {
        const inDanger = allyTargets.filter((t) => t.sight.enemies_beamable.length > 0);
        if (inDanger.length)
          return energize(s, lowestEnergy(inDanger), 1);
      }
      if (!combatRoles.includes(s.mark)) {
        const combatAllies = allyTargets.filter((t) => combatRoles.includes(t.mark));
        if (combatAllies.length > 0) {
          return energize(s, lowestEnergy(combatAllies), 1);
        } else if (workerRoles.includes(s.mark)) {
          const nonWorkers = allyTargets.filter((t) => !workerRoles.includes(t.mark));
          if (nonWorkers.length > 0) {
            return energize(s, lowestEnergy(nonWorkers), 1);
          }
        }
      }
      if (s.mark === "haul") {
        const relays = allyTargets.filter((t) => t.mark === "relay");
        if (relays.length > 0) {
          return energize(s, lowestEnergy(relays), 1);
        }
      }
      const lowAllies = allyTargets.filter((t) => t.energy + 1 <= s.energy - 1);
      if (lowAllies.length) {
        if (combatRoles.includes(s.mark)) {
          const combatAllies = lowAllies.filter((t) => combatRoles.includes(t.mark));
          if (combatAllies.length > 0) {
            return energize(s, lowestEnergy(combatAllies), 1);
          }
        } else if (!workerRoles.includes(s.mark)) {
          const nonWorkers = lowAllies.filter((t) => !workerRoles.includes(t.mark));
          if (nonWorkers.length > 0) {
            return energize(s, lowestEnergy(nonWorkers), 1);
          }
        }
      }
    }
    if (inRange(s, base) && workerRoles.includes(s.mark)) {
      return energize(s, base, 1);
    }
    if (inRange(s, nearestStar) && energyRatio(s) < 1) {
      return energize(s, s, 2);
    }
  }
  function energize(s, target, adjustFactor) {
    s.energize(target);
    s.energy -= s.size;
    target.energy += s.size * adjustFactor;
  }

  // src/main.ts
  var start = Date.now();
  update();
  for (const s of myUnits)
    pickTarget(s);
  for (const s of myUnits)
    findMove(s);
  log();
  log2();
  console.log("Computation Time: " + (Date.now() - start) + "ms");
})();
