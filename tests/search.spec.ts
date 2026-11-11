import { expect, test, type Page } from '@playwright/test';

/** Fabricated data: anonymous seller names and generic releases, nothing from a real account. */
const ARTISTS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
const WANTLIST = [
  ...Array.from({ length: 30 }, (_, i) => ({
    releaseId: 1000 + i,
    masterId: null as number | null,
    title: `Record ${String(i + 1).padStart(2, '0')}`,
    artist: `${ARTISTS[i % ARTISTS.length]} Band`,
    year: 1990 + (i % 30),
    format: 'Vinyl, LP',
    thumbUrl: null,
    addedAt: '2026-01-01T00:00:00.000Z'
  })),
  // One master with two pressings, so the autocomplete shows a group.
  {
    releaseId: 10,
    masterId: 9001,
    title: 'Record 10',
    artist: 'Delta Band',
    year: 1990,
    format: 'Vinyl, LP',
    thumbUrl: null,
    addedAt: '2026-01-02T00:00:00.000Z'
  },
  {
    releaseId: 11,
    masterId: 9001,
    title: 'Record 10 (Reissue)',
    artist: 'Delta Band',
    year: 2015,
    format: 'Vinyl, LP, Reissue',
    thumbUrl: null,
    addedAt: '2026-01-03T00:00:00.000Z'
  }
];

const TOTAL_SELLERS = 25;

function seller(index: number, currency: string) {
  const name = `seller-${String(index + 1).padStart(2, '0')}`;
  const items = WANTLIST.slice(index % 5, (index % 5) + 3).map((want, j) => ({
    listing: {
      id: index * 100 + j,
      releaseId: want.releaseId,
      sellerId: index + 1,
      sellerName: name,
      sellerRating: 99.1,
      sellerRatingCount: 120 + index,
      sellerCountry: 'Germany',
      price: { amount: 10 + j, currency: 'EUR' },
      shipping: { amount: 6, currency: 'EUR' },
      mediaCondition: 'VG+',
      sleeveCondition: 'VG',
      url: `https://www.discogs.com/sell/item/${index * 100 + j}`,
      listedAt: null
    },
    wantlistItem: want,
    price: { amount: (10 + j) * 7.46, currency },
    shipping: { amount: 6 * 7.46, currency }
  }));
  const itemsTotal = items.reduce((sum, item) => sum + item.price.amount, 0);
  const shipping = 6 * 7.46;
  return {
    sellerId: index + 1,
    sellerName: name,
    sellerRating: 99.1,
    sellerRatingCount: 120 + index,
    sellerCountry: 'Germany',
    items,
    itemCount: items.length,
    offeredCount: items.length,
    itemsTotal: { amount: itemsTotal, currency },
    shippingEstimate: { amount: shipping, currency },
    shippingUnknown: false,
    total: { amount: itemsTotal + shipping, currency },
    perItem: { amount: (itemsTotal + shipping) / items.length, currency },
    savings: { amount: index % 2 ? -12.5 : 40, currency },
    currency
  };
}

async function mockApi(page: Page) {
  const now = new Date().toISOString();
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        loggedIn: true,
        username: 'test-user',
        shipTo: { code: 'DK', name: 'Denmark' },
        checkedAt: now
      }
    })
  );
  await page.route('**/api/listings', (route) =>
    route.fulfill({
      json: {
        count: 4321,
        fetchedAt: now,
        shipTo: 'dk',
        shipToName: 'Denmark',
        loggedIn: true,
        stale: false
      }
    })
  );
  await page.route('**/api/wantlist', (route) =>
    route.fulfill({ json: { items: WANTLIST, fetchedAt: now, count: WANTLIST.length } })
  );
  await page.route('**/api/search', async (route) => {
    const body = route.request().postDataJSON() as {
      page: number;
      pageSize: number;
      currency: string;
      maxTotal: number | null;
    };
    const start = (body.page - 1) * body.pageSize;
    const results = Array.from(
      { length: Math.max(0, Math.min(body.pageSize, TOTAL_SELLERS - start)) },
      (_, i) => seller(start + i, body.currency)
    );
    // With a budget the first seller reads as trimmed from a larger offer.
    if (body.maxTotal !== null && results.length > 0) results[0].offeredCount = 7;
    await route.fulfill({
      json: {
        results,
        total: TOTAL_SELLERS,
        page: body.page,
        pageSize: body.pageSize,
        dataStatus: {
          wantlistFetchedAt: now,
          wantlistCount: WANTLIST.length,
          wantlistStale: false,
          listingsFetchedAt: now,
          listingsCount: 4321,
          listingsStale: false,
          shipTo: 'dk',
          shipToName: 'Denmark',
          loggedIn: true,
          ratesDate: '2026-11-10',
          currency: body.currency
        }
      }
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
});

test('shows the data status from the mocked API', async ({ page }) => {
  const status = page.getByRole('region', { name: 'Data status' });
  await expect(status).toContainText('32 releases');
  await expect(status).toContainText('4.321 listings');
  await expect(status).toContainText('Logged in as test-user');
});

test('searches, renders 10 cards and loads 10 more', async ({ page }) => {
  const results = page.getByRole('region', { name: 'Seller results' });
  await expect(results).toContainText('Find the sellers worth a bulk order');

  await page.getByRole('button', { name: 'Search' }).click();
  const cards = results.getByRole('article');
  await expect(cards).toHaveCount(10);
  await expect(cards.first()).toContainText('seller-01');
  await expect(results).toContainText('Showing 10 of 25 sellers');

  await page.getByRole('button', { name: 'Load 10 more' }).click();
  await expect(cards).toHaveCount(20);
  await expect(cards.nth(19)).toContainText('seller-20');
  await expect(results).toContainText('Showing 20 of 25 sellers');
  await expect(page.getByRole('button', { name: 'Load 5 more' })).toBeVisible();
});

test('a max total is sent as maxTotal and the card shows the trimmed count', async ({ page }) => {
  const budget = page.getByLabel('Max total (DKK)');
  await expect(budget).toHaveValue('');
  await budget.fill('800');
  await budget.blur();

  const request = page.waitForRequest('**/api/search');
  await page.getByRole('button', { name: 'Search' }).click();
  const body = (await request).postDataJSON() as { maxTotal: number | null };
  expect(body.maxTotal).toBe(800);

  const cards = page.getByRole('region', { name: 'Seller results' }).getByRole('article');
  await expect(cards.first()).toContainText('3 of 7 items within budget');
  await expect(cards.nth(1)).toContainText('3 items');
  await expect(cards.nth(1)).not.toContainText('within budget');

  // Clearing the field sends null again.
  await budget.fill('');
  await budget.blur();
  const cleared = page.waitForRequest('**/api/search');
  await page.getByRole('button', { name: 'Search' }).click();
  expect(((await cleared).postDataJSON() as { maxTotal: number | null }).maxTotal).toBeNull();
});

test('the must-have autocomplete adds a chip', async ({ page }) => {
  const input = page.getByRole('combobox', { name: 'Must have' });
  await input.fill('record 03');
  const listbox = page.getByRole('listbox', { name: 'Must have suggestions' });
  await expect(listbox.getByRole('option')).toHaveCount(1);
  await expect(listbox.getByRole('option').first()).toHaveText(
    'Gamma Band – Record 03 · 1992 · Vinyl, LP'
  );

  await input.press('Enter');
  const chips = page.getByRole('list', { name: 'Must have: selected' });
  await expect(chips.getByRole('listitem')).toHaveCount(1);
  await expect(chips).toContainText('Gamma Band – Record 03');
  await expect(chips).not.toContainText('version');
  await expect(input).toHaveValue('');

  // Backspace in the empty input removes the last chip again.
  await input.press('Backspace');
  await expect(chips.getByRole('listitem')).toHaveCount(0);
});

test('selecting a whole master requires any of its pressings', async ({ page }) => {
  const input = page.getByRole('combobox', { name: 'Must have' });
  await input.fill('record 10');
  const listbox = page.getByRole('listbox', { name: 'Must have suggestions' });
  const options = listbox.getByRole('option');
  // "Record 10" also matches "Record 10" itself (id 1009) plus the two-pressing master.
  await expect(options).toHaveCount(2);
  const group = options.filter({ hasText: 'Delta Band – Record 10 · 2 versions' });
  await expect(group).toHaveCount(1);
  await expect(
    group.getByRole('button', { name: 'Show versions of Delta Band – Record 10' })
  ).toHaveAttribute('aria-expanded', 'false');

  await group.click();
  const chips = page.getByRole('list', { name: 'Must have: selected' });
  await expect(chips.getByRole('listitem')).toHaveCount(1);
  await expect(chips).toContainText('Delta Band – Record 10 · any version');
  // The picked group leaves the suggestions.
  await input.fill('record 10');
  await expect(options).toHaveCount(1);
  await expect(options.first()).not.toContainText('versions');

  const request = page.waitForRequest('**/api/search');
  await page.getByRole('button', { name: 'Search' }).click();
  const body = (await request).postDataJSON() as { requiredGroups: number[][] };
  expect(body.requiredGroups).toEqual([[10, 11]]);
  expect(body).not.toHaveProperty('requiredReleaseIds');

  await chips.getByRole('button', { name: 'Remove Delta Band – Record 10 · any version' }).click();
  await expect(chips.getByRole('listitem')).toHaveCount(0);
});

test('expanding a master lets one pressing be picked', async ({ page }) => {
  const input = page.getByRole('combobox', { name: 'Must have' });
  // Matches the title of the 2015 pressing only, so the whole master is the single suggestion.
  await input.fill('reissue');
  const listbox = page.getByRole('listbox', { name: 'Must have suggestions' });
  const options = listbox.getByRole('option');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('Delta Band – Record 10 · 2 versions');

  // ArrowRight on the active group row reveals the pressings as nested options.
  await input.press('ArrowRight');
  await expect(options).toHaveCount(3);
  await expect(options.nth(1)).toHaveText('1990 · Vinyl, LP');
  await expect(options.nth(2)).toHaveText('2015 · Vinyl, LP, Reissue');
  await expect(
    listbox.getByRole('button', { name: 'Show versions of Delta Band – Record 10' })
  ).toHaveAttribute('aria-expanded', 'true');

  await input.press('ArrowLeft');
  await expect(options).toHaveCount(1);
  await listbox.getByRole('button', { name: 'Show versions of Delta Band – Record 10' }).click();
  await expect(options).toHaveCount(3);

  await input.press('ArrowDown');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', /option-r11$/);
  await input.press('Enter');
  const chips = page.getByRole('list', { name: 'Must have: selected' });
  await expect(chips.getByRole('listitem')).toHaveCount(1);
  await expect(chips).toContainText('Delta Band – Record 10 · 1 of 2 versions');

  // Only the remaining pressing is still offered, as a single row.
  await input.fill('reissue');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toHaveText('Delta Band – Record 10 · 1990 · Vinyl, LP');
  await expect(options.first().getByRole('button')).toHaveCount(0);

  const request = page.waitForRequest('**/api/search');
  await page.getByRole('button', { name: 'Search' }).click();
  expect(((await request).postDataJSON() as { requiredGroups: number[][] }).requiredGroups).toEqual(
    [[11]]
  );
});

test('chips render below the hint text', async ({ page }) => {
  const input = page.getByRole('combobox', { name: 'Must have' });
  await input.fill('record 03');
  await input.press('Enter');
  const chips = page.getByRole('list', { name: 'Must have: selected' });
  await expect(chips).toBeVisible();
  const hint = page.getByText('Sellers must offer every one of these (any version you picked).');
  await expect(hint).toBeVisible();

  const hintPrecedesChips = await hint.evaluate(
    (hintEl, chipsEl) => {
      if (!chipsEl) return false;
      return Boolean(hintEl.compareDocumentPosition(chipsEl) & Node.DOCUMENT_POSITION_FOLLOWING);
    },
    await chips.elementHandle()
  );
  expect(hintPrecedesChips).toBe(true);
  const hintBox = (await hint.boundingBox())!;
  const chipsBox = (await chips.boundingBox())!;
  expect(chipsBox.y).toBeGreaterThanOrEqual(hintBox.y + hintBox.height);
});
