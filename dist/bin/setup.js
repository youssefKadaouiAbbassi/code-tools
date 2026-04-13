#!/usr/bin/env tsx
import { main } from "../src/index.js";
main().catch((err) => {
    console.error("Setup failed:", err.message ?? err);
    process.exit(1);
});
//# sourceMappingURL=setup.js.map