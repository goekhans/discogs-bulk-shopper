import { expect, test, type Page } from '@playwright/test';

/** Fabricated data: anonymous seller names and generic releases, nothing from a real account. */
const ARTISTS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
const WANTLIST = Array.from({ length: 30 }, (_, i) => ({
  releaseId: 1000 + i,
  title: `Record ${String(i + 1).padStart(2, '0')}`,
  artist: `${ARTISTS[i % ARTISTS.length]} Band`,
  year: 1990 + (i % 30),
  format: 'Vinyl, LP',
  thumbUrl: null,
  addedAt: '2026-01-01T00:00:00.000Z'
}));

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
    };
    const start = (body.page - 1) * body.pageSize;
    const results = Array.from(
      { length: Math.max(0, Math.min(body.pageSize, TOTAL_SELLERS - start)) },
      (_, i) => seller(start + i, body.currency)
    );
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
  await expect(status).toContainText('30 releases');
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
  await expect(input).toHaveValue('');

  // Backspace in the empty input removes the last chip again.
  await input.press('Backspace');
  await expect(chips.getByRole('listitem')).toHaveCount(0);
});
