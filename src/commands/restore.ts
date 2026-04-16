import { defineCommand } from "citty";
import { runRestore } from "../restore.js";

export default defineCommand({
  meta: {
    name: "restore",
    description: "Restore configs from a backup",
  },
  args: {
    path: {
      type: "positional",
      description: "Backup path or timestamp",
      required: false,
    },
  },
  async run({ args }) {
    await runRestore(args.path);
  },
});
