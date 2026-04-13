async function test() {
  try {
    const { betterAuth } = await import('better-auth');
    console.log("BetterAuth loaded successfully!");
  } catch (err) {
    console.error("Failed to load BetterAuth:", err);
  }
}
test();
