import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';

const req = (headers: Record<string, string>, method = 'GET') => new NextRequest('http://localhost:3000/api/ai', { method, headers: { host: 'localhost:3000', ...headers } });
const status = (r: Response) => r.status;

test('the Divina page itself gets through', () => {
  assert.equal(status(middleware(req({ 'sec-fetch-site': 'same-origin' }))), 200);
  assert.equal(status(middleware(req({ 'sec-fetch-site': 'same-origin', origin: 'http://localhost:3000' }, 'POST'))), 200);
  assert.equal(status(middleware(req({}))), 200); // local tools without browser headers
});

test('other websites, foreign hosts and forged origins are refused', () => {
  assert.equal(status(middleware(req({ 'sec-fetch-site': 'cross-site' }))), 403);
  assert.equal(status(middleware(req({ 'sec-fetch-site': 'same-site' }))), 403);
  assert.equal(status(middleware(req({ origin: 'https://evil.example' }, 'POST'))), 403);
  assert.equal(status(middleware(req({ origin: 'http://localhost:4000' }, 'POST'))), 403);
  assert.equal(status(middleware(req({ host: 'evil.example:3000' }))), 403);
  assert.equal(status(middleware(req({ host: '192.168.1.20:3000' }))), 403);
  assert.equal(status(middleware(req({}, 'POST'))), 403); // a POST that hides where it came from
  assert.equal(status(middleware(req({ 'sec-fetch-site': 'none' }, 'POST'))), 403);
});
