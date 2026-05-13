export async function run(args: string[]): Promise<void> {
  console.log("🔨 forge reinstall — uninstall then install fresh");
  console.log();
  const u = await import("./uninstall");
  await u.run([]);
  console.log();
  const i = await import("./install");
  await i.run(args);
}
