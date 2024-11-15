import "./style.css";

import { run, Enums } from "./yielder";
import type { Option } from "./yielder";

const Option = Enums.Option;

type StateName = "idle" | "moving" | "action";
type AppliedTo = "agent" | "world" | "both";
interface IStore {
  set(key: string, value: unknown): boolean;
  get<T = unknown>(key: string): Option<T>;
  put(key: string, value: unknown): boolean;
  keys(): Array<string>;
}
type Concept = {
  agent: IStore;
  world: IStore;
};
type ActionEffect = {
  name: string;
  on: AppliedTo;
  apply: (agent: IStore, world: IStore) => any;
  check: (agent: IStore, world: IStore) => Option<Concept>;
};
type Action = {
  name: string;
  canPerform: (agent: IStore, world: IStore) => boolean;
  effects: Array<ActionEffect>;
  cost: number;
};
// type Expectation = {
//   name: string;
//   on: AppliedTo;
//   property: string;
//   value: ((v: unknown) => boolean) | unknown;
// };
const cmp = Object.freeze({
  GT: Symbol("cmp::gt"),
  LT: Symbol("cmp::lt"),
  EQ: Symbol("cmp::eq"),
} as const);
type Comparison = (typeof cmp)[keyof typeof cmp];
type Expects = {
  name: string;
  target: "agent" | "world";
  property: string;
  compare(a: Concept, b: Concept): Comparison;
  check(agent: IStore, world: IStore): boolean;
};
type Goal = {
  name: string;
  expectations: Array<Expects>;
};
interface IPlanner {
  setActions(actions: Array<Action>): void;
  plan(goal: Goal, agent: IStore, world: IStore): Option<Array<Action>>;
}

const NOOP: Action = {
  name: "No Op",
  canPerform: () => true,
  effects: [],
  cost: 0,
};

function applyAction(agent: IStore, world: IStore, action: Action) {
  for (const fx of action.effects) {
    fx.apply(agent, world);
  }
}

function goalReached(goal: Goal, agent: IStore, world: IStore): boolean {
  for (const expec of goal.expectations) {
    if (!expec.check(agent, world)) {
      return false;
    }
  }
  return true;
}

function goalCmp(
  goal: Goal,
  agentA: IStore,
  worldA: IStore,
  agentB: IStore,
  worldB: IStore,
): Comparison {
  let expectsA = 0;
  let expectsB = 0;
  for (const expec of goal.expectations) {
    const comparison = expec.compare(
      { agent: agentA, world: worldA },
      { agent: agentB, world: worldB },
    );
    if (comparison == cmp.GT) {
      expectsA += 1;
      continue;
    }
    if (comparison == cmp.LT) {
      expectsB += 1;
      continue;
    }
  }
  if (expectsA > expectsB) return cmp.GT;
  if (expectsB > expectsA) return cmp.LT;
  return cmp.EQ;
}

class Planner implements IPlanner {
  #actions: Array<Action> = [];
  setActions(actions: Array<Action>) {
    this.#actions = [...actions];
    this.#actions.sort((a, b) => a.cost - b.cost);
    console.log("Actions set", this.#actions);
  }

  private checkAction(agent: IStore, world: IStore, action: Action) {
    const fakeAgent = pseudoAgentFrom("CheckActionAgent", agent);
    const fakeWorld = pseudoAgentFrom("CheckActionWorld", world);
    if (!action.canPerform(fakeAgent, fakeWorld)) return Option.None;
    applyAction(fakeAgent, fakeWorld, action);
    return Option.Some({ agent: fakeAgent, world: fakeWorld });
  }

  private plan_introspection(
    goal: Goal,
    plan: Array<Action>,
    agent: IStore,
    world: IStore,
    depth: number,
  ): Array<Array<Action>> {
    if (depth <= 0) return [plan];
    let plans = [];
    const actions = this.#actions.filter((act) => plan[plan.length - 1] != act);
    console.assert(actions.length == this.#actions.length - 1);
    for (const action of actions) {
      const introspection = this.plan_introspection(
        goal,
        [...plan, action],
        agent,
        world,
        depth - 1,
      );
      const p = introspection[0];
      plans.push(p);
    }
    plans.sort((a, b) => {
      const agentA = pseudoAgentFrom("IntrospectSortingAgentA", agent);
      const worldA = pseudoAgentFrom("IntrospectSortingWorldA", world);
      const agentB = pseudoAgentFrom("IntrospectSortingAgentB", agent);
      const worldB = pseudoAgentFrom("IntrospectSortingWorldB", world);
      this.simulate_in_place(a, agentA, worldA);
      this.simulate_in_place(b, agentB, worldB);
      const c = goalCmp(goal, agentA, worldA, agentB, worldB);
      return c == cmp.GT ? -1 : c == cmp.LT ? 1 : 0;
    });
    return plans;
  }

  private simulate_in_place(plan: Array<Action>, agent: IStore, world: IStore) {
    for (let i = plan.length - 1; i >= 0; --i) {
      const action = plan[i];
      if (!action.canPerform(agent, world)) {
        return false;
      }
      applyAction(agent, world, action);
    }
    return true;
  }

  private introspect(
    goal: Goal,
    plan: Array<Action>,
    agent: IStore,
    world: IStore,
    depth: number = 5,
  ): Option<Action> {
    if (depth <= 0) return Option.None;
    const newPlans = this.plan_introspection(goal, plan, agent, world, depth);
    // console.log("plans introspection sorted", newPlans);
    // {
    //   const agentA = pseudoAgentFrom("IntrospectSortingAgentA", agent);
    //   const worldA = pseudoAgentFrom("IntrospectSortingWorldA", world);
    //   const agentB = pseudoAgentFrom("IntrospectSortingAgentB", agent);
    //   const worldB = pseudoAgentFrom("IntrospectSortingWorldB", world);
    //   this.simulate_in_place(newPlans[0], agentA, worldA);
    //   this.simulate_in_place(newPlans[1], agentB, worldB);
    //   const c = goalCmp(goal, agentA, worldA, agentB, worldB);
    //   console.assert(c != cmp.LT, "First plan should be highest rated!");
    // }
    const newPlan = newPlans[0];
    if (newPlan.length <= plan.length) {
      return Option.None;
    }
    const action = newPlan[plan.length];
    return Option.Some(action);
  }

  private simulate(
    goal: Goal,
    plan: Array<Action>,
    agent: IStore,
    world: IStore,
  ): boolean {
    const fAgent = pseudoAgentFrom("SimulatedAgent", agent);
    const fWorld = pseudoAgentFrom("SimulatedWorld", world);
    for (let i = plan.length - 1; i >= 0; --i) {
      const action = plan[i];
      if (!action.canPerform(fAgent, fWorld)) {
        return false;
      }
      applyAction(fAgent, fWorld, action);
    }
    return goalReached(goal, fAgent, fWorld);
  }

  plan(goal: Goal, agent: IStore, world: IStore): Option<Array<Action>> {
    console.log("Planning for goal:", goal.name);
    const expectations = [];
    for (const expec of goal.expectations) {
      if (!expec.check(agent, world)) {
        expectations.push(expec);
      }
    }
    console.log("Expectations to meet:", expectations);
    if (expectations.length == 0) {
      return Option.Some([NOOP]);
    }

    const possibleActions: Array<{ performable: boolean; action: Action }> = [];
    for (const action of this.#actions) {
      for (const effect of action.effects) {
        const tmpOpt = effect.check(agent, world);
        if (!Option.is_some(tmpOpt)) {
          continue;
        }
        const tmp = tmpOpt.unwrap();
        for (const expec of expectations) {
          if (expec.compare(tmp, { agent, world }) == cmp.GT) {
            const performable = action.canPerform(agent, world);
            possibleActions.push({ performable, action });
          }
        }
      }
    }
    console.log("Possible Actions:", possibleActions);
    if (possibleActions.length == 0) {
      return Option.None;
    }
    const actionsPlan = possibleActions
      .filter((pa) => pa.performable)
      .map((pa) => pa.action);
    if (actionsPlan.length > 0) {
      return Option.Some(actionsPlan);
    }
    let planDone = false;
    let goalAction = possibleActions[0].action;
    let maxIterations = 20;
    actionsPlan.push(goalAction);
    while (!planDone && maxIterations > 0) {
      maxIterations -= 1;
      const doOpt = this.introspect(
        goal,
        actionsPlan,
        agent,
        world,
        // pseudoAgentFrom("IntrospectionAgent", agent),
        // pseudoAgentFrom("IntrospectionWorld", world),
      );
      if (!Option.is_some(doOpt)) return Option.None;
      const op = doOpt.unwrap();
      actionsPlan.push(op);
      if (op.canPerform(agent, world)) {
        planDone = this.simulate(goal, actionsPlan, agent, world);
      }
    }

    console.log("Actions Plan:", actionsPlan);

    return Option.Some(actionsPlan);
  }
}

type PseudoAgent = IStore & { print(): void };
const createPseudoAgent = (name: string): PseudoAgent => {
  const values = new Map<string, unknown>();
  return {
    get<T = unknown>(key: string) {
      if (values.has(key)) {
        return Option.Some(values.get(key) as T);
      }
      return Option.None;
    },
    set(key: string, value: unknown): boolean {
      if (!values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    put(key: string, value: unknown): boolean {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    keys() {
      return [...values.keys()];
    },
    print() {
      console.log({ name, entries: [...values.entries()] });
    },
  };
};
const pseudoAgentFrom = (name: string, store: IStore): PseudoAgent => {
  const agent = createPseudoAgent(name);
  for (const key of store.keys()) {
    agent.put(key, store.get(key).unwrap());
  }
  return agent;
};

const takeFromWorldEffect = (
  amount: number,
  worldProp: string,
  agentProp: string = worldProp,
) => {
  const apply = (agent: IStore, world: IStore) => {
    const agentAmt = agent.get<number>(agentProp).unwrap();
    const worldAmt = world.get<number>(worldProp).unwrap();
    agent.set(agentProp, agentAmt + amount);
    world.set(worldProp, worldAmt + amount);
  };
  const check = (
    agent: IStore,
    world: IStore,
  ): Option<{ agent: IStore; world: IStore }> => {
    if (!Option.is_some(agent.get(agentProp))) {
      return Option.None;
    }
    if (!Option.is_some(world.get(worldProp))) {
      return Option.None;
    }
    const fakeAgent = pseudoAgentFrom("fakeAgent", agent);
    const fakeWorld = pseudoAgentFrom("fakeAgent", world);
    apply(fakeAgent, fakeWorld);
    return Option.Some({ agent: fakeAgent, world: fakeWorld });
  };
  return {
    name: `take ${worldProp} from world`,
    on: "both" as const,
    apply,
    check,
  };
};

const changeAmtEffect = (amount: number, on: AppliedTo, propName: string) => {
  const apply =
    on == "agent"
      ? (agent: IStore, _world: IStore) => {
          agent.set(propName, agent.get<number>(propName).unwrap() + amount);
        }
      : on == "world"
        ? (_agent: IStore, world: IStore) => {
            world.set(propName, world.get<number>(propName).unwrap() + amount);
          }
        : (agent: IStore, world: IStore) => {
            agent.set(propName, agent.get<number>(propName).unwrap() + amount);
            world.set(propName, world.get<number>(propName).unwrap() + amount);
          };
  const check = (agent: IStore, world: IStore) => {
    const aO = agent.get(propName);
    const wO = world.get(propName);
    if ((on == "agent" || on == "both") && !Option.is_some(aO))
      return Option.None;
    if ((on == "world" || on == "both") && !Option.is_some(wO))
      return Option.None;

    const fA = pseudoAgentFrom("fakeAgent", agent);
    const fW = pseudoAgentFrom("fakeWorld", world);

    apply(fA, fW);

    return Option.Some({ agent: fA, world: fW });
  };
  return {
    name: `${amount < 0 ? "Decrement" : "Increment"} ${propName} on ${on}`,
    on,
    apply,
    check,
  };
};

run(function* main() {
  console.log("Hello, World!");
  const planner = new Planner();
  const goal: Goal = {
    name: "keep fire",
    expectations: [
      {
        name: "fire-healthy",
        target: "world",
        property: "fire",
        check: (_agent: IStore, world: IStore) => {
          const maybeFire = world.get<number>("fire");
          console.assert(
            Option.is_some(maybeFire),
            "Expected fire property to always exist in world",
          );
          const fire = maybeFire.unwrap();
          console.assert(
            typeof fire == "number",
            "Expected fire property in world to be a number",
          );
          return fire >= 69;
        },
        compare: (a: Concept, b: Concept) => {
          const worldA = a.world;
          const worldB = b.world;
          const fireA = worldA.get<number>("fire").unwrap();
          const fireB = worldB.get<number>("fire").unwrap();
          if (fireA < 69 && fireB < 69) {
            if (fireA > fireB) {
              return cmp.GT;
            }
            if (fireB > fireA) {
              return cmp.LT;
            }
            const distA = 69 - fireA;
            const distB = 69 - fireB;
            if (distA < distB) {
              return cmp.GT;
            }
            if (distB < distA) {
              return cmp.LT;
            }
            return cmp.EQ;
          }
          const woodA = a.agent.get<number>("wood").unwrap();
          const woodB = b.agent.get<number>("wood").unwrap();
          if (woodA > woodB) {
            return cmp.GT;
          }
          if (woodB > woodA) {
            return cmp.LT;
          }
          return cmp.EQ;
        },
      },
    ],
  };
  const getWood: Action = {
    name: "get wood",
    cost: 4,
    canPerform: (agent: IStore, world: IStore) => {
      const maybeWood = world.get("wood");
      if (!Option.is_some(maybeWood)) {
        return false;
      }
      const wood = maybeWood.unwrap();
      if (typeof wood != "number") return false;
      return wood >= 2;
    },
    effects: [
      takeFromWorldEffect(2, "wood"),
      changeAmtEffect(4, "agent", "hunger"),
    ],
  };
  const addWoodToFire: Action = {
    name: "add wood to fire",
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
  const eatFood: Action = {
    name: "eat food",
    cost: 1,
    canPerform: (agent: IStore, world: IStore) => {
      const food = agent.get<number>("food").unwrap();
      return food > 0;
    },
    effects: [
      changeAmtEffect(-1, "agent", "food"),
      changeAmtEffect(4, "agent", "hunger"),
    ],
  };
  planner.setActions([NOOP, getWood, eatFood, addWoodToFire]);
  const agent = createPseudoAgent("agent");
  agent.put("pos", [0, 0]);
  agent.put("wood", 0);
  agent.put("food", 20);
  agent.put("hunger", 0);
  agent.print();
  const world = createPseudoAgent("world");
  world.put("fire", 9);
  world.put("wood", 20);
  // world.put("wood", [[1, 1]]);
  world.print();
  const maybePlan = planner.plan(goal, agent, world);
  if (!Option.is_some(maybePlan)) {
    console.log("Failed to develop a plan");
    return;
  }
  const plan = maybePlan.unwrap();
  let planCompleted = true;
  for (let i = plan.length - 1; i >= 0; --i) {
    const action = plan[i];
    console.log(`Attemping action: ${action.name}`);
    if (action.canPerform(agent, world)) {
      applyAction(agent, world, action);
    } else {
      console.log(`Failed to do action: ${action.name}`);
      planCompleted = false;
      break;
    }
  }
  console.log(planCompleted ? "Plan completed!" : "Plan failed!");
  console.log("Goal Reached?", goalReached(goal, agent, world));
  const wstate = {} as any;
  for (const key of world.keys()) {
    wstate[key] = world.get(key).unwrap();
  }
  console.log("World state:", wstate);
  const astate = {} as any;
  for (const key of agent.keys()) {
    astate[key] = agent.get(key).unwrap();
  }
  console.log("Agent state:", astate);
});
