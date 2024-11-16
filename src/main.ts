import "./style.css";

import { run, Enums } from "./yielder";
import type { Option } from "./yielder";

const Option = Enums.Option;

interface IStore {
  set(key: string, value: unknown): boolean;
  get<T = unknown>(key: string): Option<T>;
  put(key: string, value: unknown): boolean;
  keys(): Array<string>;
  has(key: string): boolean;
}
type Concept = {
  agent: IStore;
  world: IStore;
};
type ActionEffect = {
  name: string;
  on: "agent" | "world";
  apply: (agent: IStore, world: IStore) => any;
  check: (agent: IStore, world: IStore) => Option<Concept>;
};
type Action = {
  name: string;
  canPerform: (agent: IStore, world: IStore) => boolean;
  effects: Array<ActionEffect>;
  cost: number;
};
const cmp = Object.freeze({
  GT: Symbol("cmp::gt"),
  LT: Symbol("cmp::lt"),
  EQ: Symbol("cmp::eq"),
} as const);
type Comparison = (typeof cmp)[keyof typeof cmp];
type Expects = {
  name: string;
  target: ActionEffect["on"];
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

function planCost(plan: Array<Action>) {
  return plan.reduce((cost, action) => cost + action.cost, 0);
}

class Planner implements IPlanner {
  #actions: Array<Action> = [];
  #ambientActions: Array<Action> = [];

  constructor() {
    this.setActions = this.setActions.bind(this);
    this.setAmbientActions = this.setAmbientActions.bind(this);
    this.plan = this.plan.bind(this);
  }

  setActions(actions: Array<Action>) {
    this.#actions = [...actions];
    this.#actions.sort((a, b) => a.cost - b.cost);
    console.log(
      "Actions set",
      this.#actions.map((a) => a.name),
    );
  }
  setAmbientActions(actions: Array<Action>) {
    this.#ambientActions = actions;
    console.log(
      "Ambient Actions set",
      this.#ambientActions.map((a) => a.name),
    );
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
    // TODO: Figure out why it has a melt down if it can use the previous action
    const actions = this.#actions.filter((act) => plan[plan.length - 1] != act);
    for (const action of actions) {
      const simAgent = pseudoAgentFrom(`PerformableCheck${depth}Agent`, agent);
      const simWorld = pseudoAgentFrom(`PerformableCheck${depth}World`, world);
      this.simulate_in_place(plan, simAgent, simWorld);
      if (!action.canPerform(simAgent, simWorld)) continue;
      const p = [...plan, action];
      plans.push(p);
    }
    let introspected = [];
    for (;;) {
      const p = plans.pop()!;
      if (!p) break;
      const introsPls = this.plan_introspection(
        goal,
        p,
        agent,
        world,
        depth - 1,
      );
      for (const introsPlan of introsPls) {
        const simAgent = pseudoAgentFrom(`IntrospectDepth${depth}Agent`, agent);
        const simWorld = pseudoAgentFrom(`IntrospectDepth${depth}World`, world);
        const p = introsPlan;
        this.simulate_in_place(p, simAgent, simWorld);
        introspected.push({
          plan: introsPlan,
          agent: simAgent,
          world: simWorld,
        });
      }
    }
    introspected.sort(
      (
        { plan: planA, agent: agentA, world: worldA },
        { plan: planB, agent: agentB, world: worldB },
      ) => {
        const c = goalCmp(goal, agentA, worldA, agentB, worldB);
        return c == cmp.GT
          ? -1
          : c == cmp.LT
            ? 1
            : planCost(planA) - planCost(planB);
      },
    );

    return introspected.filter((_x, i) => i < 3).map((x) => x.plan);
  }

  private simulate_in_place(plan: Array<Action>, agent: IStore, world: IStore) {
    for (let i = 0; i < plan.length; ++i) {
      for (const a of this.#ambientActions) {
        applyAction(agent, world, a);
      }
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
    const newPlan = newPlans[0];
    if (newPlan.length <= plan.length) {
      console.log("Didn't expand plan");
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
    if (!this.simulate_in_place(plan, fAgent, fWorld)) return false;
    return goalReached(goal, fAgent, fWorld);
  }

  plan(goal: Goal, agent: IStore, world: IStore): Option<Array<Action>> {
    console.log("Planning for goal:", goal.name);
    // TODO: A smart way to extract the needed expectations for plan calculation
    const expectations = goal.expectations.slice();
    console.log(
      "Expectations to meet:",
      expectations.map((e) => e.name),
    );
    if (expectations.length == 0) {
      return Option.Some([NOOP]);
    }

    const actionsPlan = [];
    let planDone = false;
    let maxIterations = 50;
    while (!planDone && maxIterations > 0) {
      maxIterations -= 1;
      const doOpt = this.introspect(goal, actionsPlan, agent, world);
      if (!Option.is_some(doOpt)) return Option.None;
      const op = doOpt.unwrap();
      actionsPlan.push(op);
      if (op.canPerform(agent, world)) {
        planDone = this.simulate(goal, actionsPlan, agent, world);
      }
    }

    return Option.Some(actionsPlan);
  }
}

interface PseudoAgent extends IStore {
  print(): void;
  json(): Record<string, unknown>;
}
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
    has(key: string): boolean {
      return values.has(key);
    },
    keys() {
      return [...values.keys()];
    },
    print() {
      const data = this.json();
      console.log(`[Object ${name}<${JSON.stringify(data)}>]`);
    },
    json() {
      const data = {} as any;
      for (const [key, val] of values.entries()) data[key] = val;
      return data;
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

const pseudoAgentSetup = <T extends Record<string, any>>(
  name: string,
  origin: T,
): PseudoAgent => {
  const agent = createPseudoAgent(name);
  for (const [key, val] of Object.entries(origin)) {
    if (agent.has(key)) {
      agent.set(key, val);
    } else {
      agent.put(key, val);
    }
  }
  return agent;
};

const changeAmtEffect = (
  a: number | [number, number, number],
  on: ActionEffect["on"],
  propName: string,
) => {
  let amount: number = 0;
  let min: number = -Infinity;
  let max: number = Infinity;
  if (typeof a == "number") {
    amount = a;
  } else {
    amount = a[0];
    min = a[1];
    max = a[2];
  }
  const updateStore = (store: IStore) =>
    store.set(
      propName,
      Math.min(
        Math.max(store.get<number>(propName).unwrap() + amount, min),
        max,
      ),
    );
  const apply =
    on == "agent"
      ? (agent: IStore, _world: IStore) => updateStore(agent)
      : (_agent: IStore, world: IStore) => updateStore(world);
  const check = (agent: IStore, world: IStore) => {
    const aO = agent.get(propName);
    const wO = world.get(propName);
    if (on == "agent" && !Option.is_some(aO)) return Option.None;
    if (on == "world" && !Option.is_some(wO)) return Option.None;

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

class ExpectBuilder {
  #name: string;
  #prop: string;
  #target: Expects["target"];
  #checker: Expects["check"];
  #comparer: Expects["compare"];

  constructor() {
    this.#name = "expectation";
    this.#prop = "<no-property>";
    this.#target = "agent";
    this.#checker = () => true;
    this.#comparer = () => cmp.EQ;
  }

  name(name: string): this {
    this.#name = name;
    return this;
  }
  prop(prop: string): this {
    this.#prop = prop;
    return this;
  }
  target(target: Expects["target"]): this {
    this.#target = target;
    return this;
  }
  checker(checker: Expects["check"]): this {
    this.#checker = checker;
    return this;
  }
  comparer(comparer: Expects["compare"]): this {
    this.#comparer = comparer;
    return this;
  }
  build(): Expects {
    const name = this.#name;
    const property = this.#prop;
    console.assert(typeof property == "string");
    const target = this.#target;
    const checker = this.#checker;
    const check =
      target == "agent"
        ? (a: IStore, w: IStore) => {
            if (!Option.is_some(a.get(property))) return false;
            return checker(a, w);
          }
        : (a: IStore, w: IStore) => {
            if (!Option.is_some(w.get(property))) return false;
            return checker(a, w);
          };
    const compare = this.#comparer;
    return {
      name,
      property,
      target,
      compare,
      check,
    };
  }
}

class GoalBuilder {
  #name: string;
  #expectations: Array<Expects>;
  constructor() {
    this.#name = "goal";
    this.#expectations = [];
  }
  name(name: string): this {
    this.#name = name;
    return this;
  }
  expect(expecBuild: (builder: ExpectBuilder) => Expects): this {
    const builder = new ExpectBuilder();
    const expec = expecBuild(builder);
    this.#expectations.push(expec);
    return this;
  }
  build(): Goal {
    const name = this.#name;
    const expectations = this.#expectations;
    return { name, expectations };
  }
}
function goalBuilder(): GoalBuilder {
  return new GoalBuilder();
}

function numCmp(a: number, b: number): Comparison {
  return a > b ? cmp.GT : b > a ? cmp.LT : cmp.EQ;
}

run(function* main() {
  console.log("Hello, World!");
  const planner = new Planner();
  const surviveGoal = goalBuilder()
    .name("survive")
    .expect((HealthyFire) => {
      return HealthyFire.name("fire-healthy")
        .target("world")
        .prop("fire")
        .checker((_a: IStore, world: IStore) => {
          const fire = world.get<number>("fire").unwrap();
          return fire >= 69;
        })
        .comparer((a: Concept, b: Concept): Comparison => {
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
        .checker((agent: IStore, _w: IStore) => {
          const wood = agent.get<number>("wood").unwrap();
          return wood >= 5 && wood <= 10;
        })
        .comparer((a: Concept, b: Concept): Comparison => {
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
        .checker((agent: IStore) => {
          const hunger = agent.get<number>("hunger").unwrap();
          return hunger < 50;
        })
        .comparer((a: Concept, b: Concept) => {
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

  console.time("planning");
  const maybePlan = planner.plan(surviveGoal, agent, world);
  console.timeEnd("planning");

  if (!Option.is_some(maybePlan)) {
    console.log("Failed to develop a plan");
    return;
  }
  const plan = maybePlan.unwrap().filter((a) => a != NOOP);
  {
    // Just for a nice looking log
    const devPlan = plan
      .slice()
      .map((a) => a.name)
      .reduce(
        (m, a) => {
          if (m.length == 0) {
            m.push([a, 1]);
            return m;
          }
          const idx = m.length - 1;
          if (m[idx][0] != a) {
            m.push([a, 1]);
          } else {
            m[idx][1] = m[idx][1] + 1;
          }
          return m;
        },
        [] as Array<[string, number]>,
      )
      .map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
      .reduce(
        (str, a, i) =>
          str.length == 0
            ? ` 0${i + 1}. ${a}`
            : `${str}\n ${String(i + 1).padStart(2, "0")}. ${a}`,
        "",
      );
    console.log(`Developed plan: Length: ${plan.length}\n${devPlan}`);
  }

  for (let i = 0; i < plan.length; ++i) {
    // Ambient Actions: Stuff that always happens
    for (const action of ambient) {
      if (action.canPerform(agent, world)) {
        applyAction(agent, world, action);
      }
    }
    const action = plan[i];
    if (action.canPerform(agent, world)) {
      applyAction(agent, world, action);
    } else {
      console.warn(
        `Aborting plan! Can't perform action(${String(i + 1).padStart(2, "0")}): ${action.name}`,
      );
      break;
    }
  }
  console.log("Goal Reached?", goalReached(surviveGoal, agent, world));
  console.log("World end state:");
  world.print();
  console.log("Agent end state:");
  agent.print();
});
