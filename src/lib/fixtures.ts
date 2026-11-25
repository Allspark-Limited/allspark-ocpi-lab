import type { EnvironmentView } from './ocpi.ts';

export function fixtures(environment: EnvironmentView) {
  const now = new Date().toISOString();
  const owner = { country_code: environment.countryCode, party_id: environment.partyId };
  const location = {
    ...owner, id: 'LAB-LOCATION-1', publish: true, name: 'Allspark Synthetic Charging Lab',
    address: '1 Interoperability Way', city: 'Dublin', country: 'IRL',
    coordinates: { latitude: '53.3498', longitude: '-6.2603' },
    evses: [{ uid: 'LAB-EVSE-1', evse_id: `${environment.countryCode}*${environment.partyId}*ELAB1`,
      status: 'AVAILABLE', connectors: [{ id: '1', standard: 'IEC_62196_T2_COMBO', format: 'CABLE',
        power_type: 'DC', max_electric_power: 150000, tariff_ids: ['LAB-TARIFF-1'], last_updated: now }], last_updated: now }],
    last_updated: now,
  };
  const tariff = {
    ...owner, id: 'LAB-TARIFF-1', currency: 'EUR', type: 'REGULAR',
    elements: [{ price_components: [{ type: 'ENERGY', price: 0.5, vat: 23, step_size: 1 }] }], last_updated: now,
  };
  const token = {
    ...owner, uid: 'SYNTHETIC-TOKEN-1', type: 'APP_USER', contract_id: `${environment.countryCode}-${environment.partyId}-SYNTHETIC`,
    visual_number: 'SYNTHETIC', issuer: 'Allspark OCPI Lab', group_id: 'LAB', valid: true,
    whitelist: 'ALWAYS', last_updated: now,
  };
  return { locations: [location], tariffs: [tariff], tokens: [token], sessions: [], cdrs: [] } as const;
}
