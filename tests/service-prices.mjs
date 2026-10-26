// A design surcharge must never become the advertised price of a full pedicure.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeContent } from '../app/src/lib/normalize.ts';

const snapshot = JSON.parse(await readFile(new URL('../app/src/data/site-content.json', import.meta.url), 'utf8'));
const cms = structuredClone(snapshot);
cms.services.find((item) => item.key === 'pedicure').price_from = 9999;
// An older CMS response may omit the optional technical flag on known rows.
cms.calculator_options.forEach((item) => delete item.is_addon);
const normalized = normalizeContent(cms, snapshot);
assert.equal(normalized.services.find((item) => item.key === 'pedicure').price_from, 2000);
assert.equal(normalized.services.find((item) => item.key === 'brows').price_from, 1000);
assert.equal(normalized.calculator_options.find((item) => item.key === 'pedicure-design-simple').is_addon, true);
cms.calculator_options.find((item) => item.key === 'pedicure-toes').archived = true;
assert.equal(normalizeContent(cms, snapshot).services.find((item) => item.key === 'pedicure').price_from, 2500);
console.log('PASS CMS prices: complete pedicure variants, optional add-on flags and archived treatments');
