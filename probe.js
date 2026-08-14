const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on("request", (req) => {
    if (req.method() === "POST") {
      console.log("--- POST REQUEST ---");
      console.log(req.url());
      console.log(req.postData());
    }
  });

  await page.goto(
    "https://ssb-prod.ec.cccd.edu/PROD/pw_pub_sched.p_search?Term=202570&college=GW",
    { waitUntil: "networkidle" },
  );

  // Select "Fall 2025" already selected via Term param; select subject = <all> via the multi-select
  await page.selectOption("#sel_subj", ["%"]);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('input[type="submit"][value="Search"]'),
  ]);

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("--- RESULT PAGE TEXT (first 1500 chars) ---");
  console.log(bodyText.slice(0, 1500));

  await browser.close();
})();
