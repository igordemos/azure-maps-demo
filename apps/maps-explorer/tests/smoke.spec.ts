import { test, expect } from "@playwright/test";

test("loads the Azure Maps Explorer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Azure Maps API Explorer" })).toBeVisible();
  await expect(page.getByText("Request Preview")).toBeVisible();
});
