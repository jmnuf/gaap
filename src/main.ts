import "./style.css";

import { run, Enums } from "./yielder";
import type { Option } from "./yielder";

import { NOOP, applyAction, goalReached } from "./gaap";
import type { Action } from "./gaap";

import { createWorld } from "./world";

const Option = Enums.Option;

const WIDTH = 400;
const HEIGHT = 400;

run(function* main() {
  console.log("Hello, World!");

  const appDiv = document.querySelector("div#app");
  if (!appDiv) throw new Error("Missing app root");
  const canvas = document.createElement("canvas");
  appDiv.appendChild(canvas);

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error(
      `2D rendering context not supported in ${new Date().getFullYear()}? Kappa`,
    );

  const { goal, agent, world, planner } = createWorld();
  type Vec2 = { x: number; y: number };
  type RenderFn = (opt: { center: Vec2 }) => void;

  const decayRate = 5_000;

  world.put("fire.decayTimestamp", Date.now());
  world.put("fire.size", {
    x: 20,
    y: 20,
  } as Vec2);
  world.put("fire.render", ({ center }: { center: Vec2 }) => {
    const size = world.get<Vec2>("fire.size").unwrap();
    const life = world.get<number>("fire").unwrap();
    const decayTimestamp = world.get<number>("fire.decayTimestamp").unwrap();
    const pos = { x: center.x, y: HEIGHT - size.y - 2 };
    ctx.fillStyle = "rgb(200, 50, 50)";
    ctx.strokeStyle = "rgb(255, 255, 250)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, size.x, size.y, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgb(255, 255, 50)";
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 10, size.x / 3, size.y / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.filleStyle = "rgb(51 0 0)";
    ctx.fillText(`Lifetime: ${life}`, pos.x + size.x / 2, pos.y - 50);
    ctx.fillText(
      `Last Decay: ${((decayRate - (Date.now() - decayTimestamp)) / 1_000).toFixed(2)}`,
      pos.x + size.x / 2,
      pos.y - 20,
    );
  });

  agent.put("size", {
    x: 50,
    y: 100,
  } as Vec2);
  agent.put("render", ({ center }: { center: Vec2 }) => {
    const lastAction = agent.get<{ name: string }>("last-action").unwrap();
    const size = agent.get<Vec2>("size").unwrap();
    const hunger = agent.get<number>("hunger").unwrap();
    const food = agent.get<number>("food").unwrap();
    const wood = agent.get<number>("wood").unwrap();
    const fireSize = world.get<Vec2>("fire.size").unwrap();

    const pos: Vec2 = {
      x: center.x - fireSize.x - size.x - 10,
      y: HEIGHT - size.y - 2,
    };

    ctx.fillStyle = "rgb(150, 75, 0)";
    ctx.fillRect(pos.x, pos.y, size.x, size.y);
    ctx.strokeStyle = "rgb(0 0 0)";
    ctx.lineWidth = 4;
    ctx.strokeRect(pos.x, pos.y, size.x, size.y);

    ctx.font = "20px monospace";
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillText(`Action: ${lastAction.name}`, pos.x - 50, pos.y - 130);
    if (hunger >= 100) {
      ctx.fillStyle = "rgb(100, 0, 0)";
      ctx.fillText(`Alive: ${hunger < 100}`, pos.x - 50, pos.y - 100);
      ctx.fillStyle = "rgb(0, 0, 0)";
    } else {
      ctx.fillText(`Alive: ${hunger < 100}`, pos.x - 50, pos.y - 100);
    }
    ctx.fillText(`Hunger: ${hunger}`, pos.x - 50, pos.y - 70);
    ctx.fillText(`Wood: ${wood}`, pos.x - 50, pos.y - 40);
    ctx.fillText(`Food: ${food}`, pos.x - 50, pos.y - 10);
  });

  const render = () => {
    const center = { x: canvas.width / 2, y: canvas.height / 2 } as Vec2;
    ctx.fillStyle = "rgb(51, 150, 51)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const fireRenderer = world.get<RenderFn>("fire.render").unwrap();
    fireRenderer({ center });

    const actorRenderer = agent.get<RenderFn>("render").unwrap();
    actorRenderer({ center });

    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);

  setInterval(() => {
    const fire = world.get<number>("fire").unwrap();
    world.set("fire", fire - 1);
    world.set("fire.decayTimestamp", Date.now());
    console.log("Fire decay:", fire - 1);
  }, decayRate);
  setInterval(() => {
    const wood = world.get<number>("wood").unwrap();
    world.set("wood", wood + 5);
    console.log("Wood growth:", wood + 5);
  }, 5_000);

  type Plan = Array<Action>;
  type ActorPlanData = { plan: Plan; current: number; timestamp: number };

  agent.put("plan", { plan: [], current: 0, timestamp: 0 } as ActorPlanData);
  agent.put("last-action", { success: false, name: "<[Object object]>" });

  const think = () => {
    const hunger = agent.get<number>("hunger").unwrap();
    if (hunger >= 100) {
      return;
    }
    const data = agent.get<ActorPlanData>("plan").unwrap();
    const plan: Plan = data.plan;
    if (Date.now() - data.timestamp >= 1_500) {
      console.time("planning");
      const maybePlan = planner.plan(goal, agent, world);
      console.timeEnd("planning");
      data.timestamp = Date.now();
      plan.length = 0;
      data.current = 0;
      if (!Option.is_some(maybePlan)) {
        setTimeout(think, 33);
        return;
      }
      for (const action of maybePlan.unwrap().filter((a) => a != NOOP)) {
        plan.push(action);
      }
      // pretty_print_plan(plan);
      setTimeout(think, 33);
      return;
    }
    if (plan.length == 0 || data.current >= plan.length) {
      setTimeout(think, 33);
      return;
    }

    const action = plan[data.current++];
    const lastAction = agent
      .get<{ success: boolean; name: string }>("last-action")
      .unwrap();

    if (action) {
      lastAction.name = action.name;
      if (action.canPerform(agent, world)) {
        applyAction(agent, world, action);
        lastAction.success = true;
      } else {
        lastAction.success = false;
      }
    } else {
      lastAction.name = "<[Object object]>";
      lastAction.success = false;
    }

    const achievedGoal = goalReached(goal, agent, world);
    console.log("Goal Reached?", achievedGoal);
    // if (achievedGoal) {
    // console.log("World end state:");
    // world.print();
    // console.log("Agent end state:");
    // agent.print();
    // }
    setTimeout(think, 3_000);
  };
  setTimeout(think, 33);
});

// function pretty_print_plan(plan: Array<Action>) {
//   // Just for a nice looking log
//   const devPlan = plan
//     .slice()
//     .map((a) => a.name)
//     .reduce(
//       (m, a) => {
//         if (m.length == 0) {
//           m.push([a, 1]);
//           return m;
//         }
//         const idx = m.length - 1;
//         if (m[idx][0] != a) {
//           m.push([a, 1]);
//         } else {
//           m[idx][1] = m[idx][1] + 1;
//         }
//         return m;
//       },
//       [] as Array<[string, number]>,
//     )
//     .map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
//     .reduce(
//       (str, a, i) =>
//         str.length == 0
//           ? ` 0${i + 1}. ${a}`
//           : `${str}\n ${String(i + 1).padStart(2, "0")}. ${a}`,
//       "",
//     );
//   console.log(`Developed plan: Length: ${plan.length}\n${devPlan}`);
// }
