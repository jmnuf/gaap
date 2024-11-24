import { Enums } from "./yielder";
import type { Option } from "./yielder";

const Option = Enums.Option;

export interface IStore {
  set(key: string, value: unknown): boolean;
  get<T = unknown>(key: string): Option<T>;
  put(key: string, value: unknown): boolean;
  keys(): Array<string>;
  has(key: string): boolean;
}
export type Concept = {
  agent: IStore;
  world: IStore;
};
export type ActionEffect = {
  name: string;
  on: "agent" | "world";
  apply: (agent: IStore, world: IStore) => any;
  check: (agent: IStore, world: IStore) => Option<Concept>;
};
export type Action = {
  name: string;
  canPerform: (agent: IStore, world: IStore) => boolean;
  effects: Array<ActionEffect>;
  cost: number;
};
export const cmp = Object.freeze({
  GT: Symbol("cmp::gt"),
  LT: Symbol("cmp::lt"),
  EQ: Symbol("cmp::eq"),
} as const);
export type Comparison = (typeof cmp)[keyof typeof cmp];
export type Expects = {
  name: string;
  target: ActionEffect["on"];
  property: string;
  compare(a: Concept, b: Concept): Comparison;
  check(agent: IStore, world: IStore): boolean;
};
export type Goal = {
  name: string;
  expectations: Array<Expects>;
};
export interface IPlanner {
  setActions(actions: Array<Action>): void;
  plan(goal: Goal, agent: IStore, world: IStore): Option<Array<Action>>;
}

export const NOOP: Action = {
  name: "No Op",
  canPerform: () => true,
  effects: [],
  cost: 0,
};

export function applyAction(agent: IStore, world: IStore, action: Action) {
  for (const fx of action.effects) {
    fx.apply(agent, world);
  }
}

export function goalReached(goal: Goal, agent: IStore, world: IStore): boolean {
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

export function planCost(plan: Array<Action>) {
  return plan.reduce((cost, action) => cost + action.cost, 0);
}

export class Planner implements IPlanner {
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
    // console.log("Planning for goal:", goal.name);
    // TODO: A smart way to extract the needed expectations for plan calculation
    const expectations = goal.expectations.slice();
    // console.log(
    //   "Expectations to meet:",
    //   expectations.map((e) => e.name),
    // );
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

export interface PseudoAgent extends IStore {
  print(): void;
  json(): Record<string, unknown>;
}
export const createPseudoAgent = (name: string): PseudoAgent => {
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
export const pseudoAgentFrom = (name: string, store: IStore): PseudoAgent => {
  const agent = createPseudoAgent(name);
  for (const key of store.keys()) {
    agent.put(key, store.get(key).unwrap());
  }
  return agent;
};

export const pseudoAgentSetup = <T extends Record<string, any>>(
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

export const changeAmtEffect = (
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

export function goalBuilder(): GoalBuilder {
  return new GoalBuilder();
}

export function numCmp(a: number, b: number): Comparison {
  return a > b ? cmp.GT : b > a ? cmp.LT : cmp.EQ;
}
