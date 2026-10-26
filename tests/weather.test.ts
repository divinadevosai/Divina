import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apparentC, metForecastUrl, metToWeather, placeFrom, symbolLabel, symbolToWmo } from '../src/lib/weather/met';

test('MET symbols map to the conditions the room understands', () => {
  assert.equal(symbolToWmo('clearsky_day'), 0);
  assert.equal(symbolToWmo('lightrainshowers_night'), 80);
  assert.equal(symbolToWmo('heavysnow'), 75);
  assert.equal(symbolToWmo('rainandthunder'), 95);
  assert.equal(symbolLabel('lightrainshowers_day'), 'Light rain showers');
  assert.equal(symbolLabel('partlycloudy_night'), 'Partly cloudy');
});

test('coordinates are rounded before they leave the computer', () => {
  assert.match(metForecastUrl(55.864237, -4.251806), /lat=55\.86&lon=-4\.25$/);
});

test('a MET forecast becomes a weather card without invented numbers', () => {
  const t0 = Date.parse('2026-09-29T10:00:00Z');
  const timeseries = Array.from({ length: 30 }, (_, i) => ({
    time: new Date(t0 + i * 3600e3).toISOString(),
    data: {
      instant: { details: { air_temperature: 10 + i / 10, relative_humidity: 80, wind_speed: 5 } },
      next_1_hours: { summary: { symbol_code: 'lightrain_day' }, details: { precipitation_amount: 0.3, ...(i % 2 ? {} : { probability_of_precipitation: 40 }) } },
      next_6_hours: { summary: { symbol_code: 'cloudy' } },
    },
  }));
  const w = metToWeather({ properties: { timeseries } }, 'Glasgow, GB', 'MET Norway');
  assert.equal(w.label, 'Light rain');
  assert.equal(w.condition, 'rain');
  assert.equal(w.windKph, 18);
  assert.equal(w.hourly.length, 24);
  assert.equal(w.hourly[0].precip, 40);
  assert.equal(w.hourly[1].precip, undefined); // not given → not made up
  assert.equal(w.hourly[1].mm, 0.3);
  assert.ok(w.daily.length >= 2);
  assert.ok(Math.abs(w.feelsC - apparentC(10, 80, 5)) < 1e-9);
  assert.equal(placeFrom({ lat: '1', lon: '2', name: 'Glasgow', address: { country_code: 'gb' } }).name, 'Glasgow, GB');
});
