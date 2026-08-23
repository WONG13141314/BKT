import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'phone', width: 360, height: 740 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`landing page is usable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Mathopoly' })).toBeVisible();
    await expect(page.getByText('Roll, solve, and build your empire')).toBeVisible();
    await expect(page.getByText(/primary math/i)).toHaveCount(0);
    await expect(page.getByLabel('Your Nickname')).toBeFocused();
    await expect(page.getByRole('radiogroup', { name: 'Pick your token' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll<HTMLElement>('button, input')]
        .filter((element) => element.offsetParent !== null)
        .map((element) => element.getBoundingClientRect().height),
    }));

    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(Math.min(...layout.controls)).toBeGreaterThanOrEqual(44);
  });
}

test('landing controls have visible keyboard focus', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your Nickname').press('Tab');
  const focusedToken = page.getByRole('radio').first();
  await expect(focusedToken).toBeFocused();
  expect(await focusedToken.evaluate((element) => getComputedStyle(element).outlineStyle))
    .not.toBe('none');
});

test('sound settings are accessible and persist', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open sound settings' }).click();

  const panel = page.getByRole('dialog', { name: 'Sound settings' });
  await expect(panel).toBeVisible();
  const musicToggle = panel.getByRole('button', { name: 'Toggle background music' });
  await expect(musicToggle).toHaveAttribute('aria-pressed', 'true');
  await musicToggle.click();
  await panel.getByRole('slider', { name: 'Game volume' }).fill('0.4');

  await page.reload();
  await page.getByRole('button', { name: 'Open sound settings' }).click();
  await expect(page.getByRole('button', { name: 'Toggle background music' }))
    .toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('40%')).toBeVisible();
});
