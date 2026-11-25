import { createEnvironment, listEnvironments } from '../src/lib/repository.ts';

if ((await listEnvironments()).length === 0) {
  const result = await createEnvironment({
    name: 'Local eMSP lab', countryCode: 'IE', partyId: 'LAB', role: 'EMSP',
    modules: ['credentials', 'locations', 'tariffs', 'tokens', 'commands', 'sessions', 'cdrs'], scenario: 'success',
  });
  console.log(`Created ${result.environment.slug}; Token A is shown once: ${result.tokenA}`);
} else {
  console.log('Seed skipped: an environment already exists.');
}
