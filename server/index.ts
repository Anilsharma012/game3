// Force Node timezone to Asia/Kolkata for consistent server-side dates
if (!process.env.TZ) {
  process.env.TZ = "Asia/Kolkata";
}

import("./app").then(({ default: app }) => {
  const PORT = process.env.PORT || "3001"; // default to string
  const HOST = "0.0.0.0";

  app.listen(Number(PORT), HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  });
});
