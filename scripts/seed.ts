import { createEnvironment, listEnvironments } from '../src/lib/repository.ts';
import { createUser } from '../src/lib/auth.ts';

if ((await listEnvironments()).length === 0) {
  const user = await createUser({ email: 'admin@allspark-ocpi-lab.local', password: 'LabAdmin123!' });
  const result = await createEnvironment({
    name: 'Local eMSP lab', countryCode: 'IE', partyId: 'LAB', role: 'EMSP',
    modules: ['credentials', 'locations', 'tariffs', 'tokens', 'commands', 'sessions', 'cdrs'], scenario: 'success',
    ownerId: user.id,
  });
  console.log(`Created user ${user.email}; environment ${result.environment.slug}; Token A is shown once: ${result.tokenA}`);
} else {
  console.log('Seed skipped: an environment already exists.');
}
