import { Enums } from "./yielder";
import type { Option } from "./yielder";

const Option = Enums.Option;

import {
  goalBuilder,
  Planner,
  cmp,
  numCmp,
  NOOP,
  pseudoAgentSetup,
  changeAmtEffect,
} from "./gaap";
import type { IStore, Action } from "./gaap";

export function createWorld() {
  const planner = new Planner();
  const surviveGoal = goalBuilder()
    .name("survive")
    .expect((HealthyFire) => {
      return HealthyFire.name("fire-healthy")
        .target("world")
        .prop("fire")
        .checker((_a, world) => {
          const fire = world.get<number>("fire").unwrap();
          return fire >= 69;
        })
        .comparer((a, b) => {
          const fireA = a.world.get<number>("fire").unwrap();
          const fireB = b.world.get<number>("fire").unwrap();
          const woodA = a.agent.get<number>("wood").unwrap();
          const woodB = b.agent.get<number>("wood").unwrap();
          if (fireA < 69 && 69 > fireB) {
            const fireCmp = numCmp(fireA, fireB);
            if (fireCmp != cmp.EQ) return fireCmp;
            if (woodA < 2 && woodB < 2) {
              return cmp.EQ;
            }
          }
          if (woodA > woodB) {
            return cmp.GT;
          }
          if (woodB > woodA) {
            return cmp.LT;
          }
          return cmp.EQ;
        })
        .build();
    })
    .expect((HasFewWood) => {
      return HasFewWood.name("have-wood")
        .target("agent")
        .prop("wood")
        .checker((agent, _w) => {
          const wood = agent.get<number>("wood").unwrap();
          return wood >= 5 && wood <= 10;
        })
        .comparer((a, b) => {
          const prop = "wood";
          const woodA = a.agent.get<number>(prop).unwrap();
          const woodB = b.agent.get<number>(prop).unwrap();
          if (woodA < 5 && 5 > woodB) {
            return numCmp(woodA, woodB);
          }
          if (woodA > 10 && woodB <= 10) {
            return cmp.LT;
          }
          if (woodA <= 10 && woodB > 10) {
            return cmp.GT;
          }
          if (woodA > 10 && 10 < woodB) {
            return numCmp(woodB, woodA);
          }
          return cmp.EQ;
        })
        .build();
    })
    .expect((NotStarving) => {
      return NotStarving.name("dont-starve")
        .target("agent")
        .prop("hunger")
        .checker((agent) => {
          const hunger = agent.get<number>("hunger").unwrap();
          return hunger < 50;
        })
        .comparer((a, b) => {
          const hungerA = a.agent.get<number>("hunger").unwrap();
          const hungerB = b.agent.get<number>("hunger").unwrap();
          if (hungerA < 10 && hungerB < 10) return cmp.EQ;
          return numCmp(hungerB, hungerA);
        })
        .build();
    })
    .build();

  const getWood: Action = {
    name: "get_wood",
    cost: 4,
    canPerform: (_agent: IStore, world: IStore) => {
      const maybeWood = world.get("wood");
      if (!Option.is_some(maybeWood)) {
        return false;
      }
      const wood = maybeWood.unwrap();
      if (typeof wood != "number") return false;
      return wood >= 2;
    },
    effects: [
      changeAmtEffect(-2, "world", "wood"),
      changeAmtEffect(2, "agent", "wood"),
      changeAmtEffect(4, "agent", "hunger"),
    ],
  };
  const addWoodToFire: Action = {
    name: "feed_fire",
    cost: 2,
    canPerform: (agent: IStore, world: IStore) => {
      const woodOpt = agent.get("wood");
      if (!Option.is_some(agent.get("wood"))) {
        return false;
      }
      if (!Option.is_some(world.get("wood"))) {
        return false;
      }
      const wood = woodOpt.unwrap();
      if (typeof wood != "number") return false;
      return wood >= 2;
    },
    effects: [
      changeAmtEffect(-2, "agent", "wood"),
      changeAmtEffect(10, "world", "fire"),
      changeAmtEffect(2, "agent", "hunger"),
    ],
  };
  const fireDecay: Action = {
    name: "fire_decay",
    cost: 0,
    canPerform: (_agent: IStore, world: IStore) => {
      const fire = world.get<number>("fire").unwrap();
      return fire > 0;
    },
    effects: [changeAmtEffect(-1, "world", "fire")],
  };
  const eatFood: Action = {
    name: "eat_food",
    cost: 1,
    canPerform: (agent: IStore, _world: IStore) => {
      const food = agent.get<number>("food").unwrap();
      const hunger = agent.get<number>("hunger").unwrap();
      return food > 0 && hunger > 2;
    },
    effects: [
      changeAmtEffect(-1, "agent", "food"),
      changeAmtEffect([-4, 0, 100], "agent", "hunger"),
    ],
  };
  const ambient = [fireDecay];
  planner.setActions([NOOP, getWood, eatFood, addWoodToFire]);
  planner.setAmbientActions(ambient);
  const agent = pseudoAgentSetup("Agent", {
    pos: [0, 0],
    wood: 0,
    food: 20,
    hunger: 0,
  });
  agent.print();
  const world = pseudoAgentSetup("World", {
    fire: 9,
    wood: 50,
  });
  world.print();

  return { goal: surviveGoal, world, agent, ambient, planner } as const;
}
