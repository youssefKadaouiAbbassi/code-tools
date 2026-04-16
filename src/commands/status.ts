import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "status",
    description: "Show installed vs missing components",
  },
  run: () => {
    console.log("Status: not yet implemented");
  },
});
